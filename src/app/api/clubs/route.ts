import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (role === Role.SUPER_ADMIN) {
    const clubs = await prisma.club.findMany({
      include: {
        _count: { select: { users: true, seasons: true, players: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(clubs);
  }

  // ADMINs can read their own club only, so admin pages can reflect current
  // club-wide settings (e.g. enforceFamilyVoteExclusion) without a second
  // endpoint. Same shape as the SUPER_ADMIN response for consistency.
  if (role === Role.ADMIN) {
    const adminClubId = (session?.user as Record<string, unknown>)?.clubId as string | undefined;
    if (!adminClubId) {
      return NextResponse.json([]);
    }
    const club = await prisma.club.findUnique({
      where: { id: adminClubId },
      include: {
        _count: { select: { users: true, seasons: true, players: true } },
      },
    });
    return NextResponse.json(club ? [club] : []);
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, slug, adminName, adminEmail, adminPassword, isAdultClub, enableAiChat, enablePlayHq, allowTeamDutyRoles, enforceFamilyVoteExclusion, maxVotesPerRound } = await req.json();

  if (!name || !slug) {
    return NextResponse.json({ error: "Club name and slug are required" }, { status: 400 });
  }

  let maxVotes: number | undefined;
  if (maxVotesPerRound !== undefined) {
    const parsed = Number(maxVotesPerRound);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return NextResponse.json({ error: "maxVotesPerRound must be a positive integer" }, { status: 400 });
    }
    maxVotes = parsed;
  }

  try {
    const club = await prisma.club.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, "-"),
        isAdultClub: !!isAdultClub,
        allowTeamDutyRoles: !!allowTeamDutyRoles,
        enforceFamilyVoteExclusion: !!enforceFamilyVoteExclusion,
        ...(maxVotes !== undefined ? { maxVotesPerRound: maxVotes } : {}),
        ...(enableAiChat !== undefined && { enableAiChat: !!enableAiChat }),
        ...(enablePlayHq !== undefined && { enablePlayHq: !!enablePlayHq }),
      },
    });

    // Optionally create a club admin
    if (adminEmail && adminPassword && adminName) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: adminName,
          role: Role.ADMIN,
          clubId: club.id,
        },
      });
    }

    return NextResponse.json(club, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A club with this slug already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.SUPER_ADMIN && role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, name, slug, isAdultClub, enableAiChat, enablePlayHq, allowTeamDutyRoles, enforceFamilyVoteExclusion, maxVotesPerRound } = body;
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  // ADMINs can only update their own club, and only a small allow-list of
  // club-wide voting settings (maxVotesPerRound, enforceFamilyVoteExclusion).
  if (role === Role.ADMIN) {
    const adminClubId = (session?.user as Record<string, unknown>)?.clubId as string | undefined;
    if (!adminClubId || adminClubId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (name !== undefined || slug !== undefined || isAdultClub !== undefined || enableAiChat !== undefined || enablePlayHq !== undefined || allowTeamDutyRoles !== undefined) {
      return NextResponse.json(
        { error: "ADMINs may only update maxVotesPerRound or enforceFamilyVoteExclusion" },
        { status: 403 },
      );
    }
    if (maxVotesPerRound === undefined && enforceFamilyVoteExclusion === undefined) {
      return NextResponse.json(
        { error: "maxVotesPerRound or enforceFamilyVoteExclusion is required" },
        { status: 400 },
      );
    }
  }

  let maxVotes: number | undefined;
  if (maxVotesPerRound !== undefined) {
    const parsed = Number(maxVotesPerRound);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return NextResponse.json({ error: "maxVotesPerRound must be a positive integer" }, { status: 400 });
    }
    maxVotes = parsed;
  }

  try {
    const club = await prisma.club.update({
      where: { id },
      data: {
        name: name || undefined,
        slug: slug ? slug.toLowerCase().replace(/\s+/g, "-") : undefined,
        isAdultClub: isAdultClub !== undefined ? !!isAdultClub : undefined,
        allowTeamDutyRoles: allowTeamDutyRoles !== undefined ? !!allowTeamDutyRoles : undefined,
        enableAiChat: enableAiChat !== undefined ? !!enableAiChat : undefined,
        enablePlayHq: enablePlayHq !== undefined ? !!enablePlayHq : undefined,
        enforceFamilyVoteExclusion:
          enforceFamilyVoteExclusion !== undefined ? !!enforceFamilyVoteExclusion : undefined,
        maxVotesPerRound: maxVotes,
      },
    });
    return NextResponse.json(club);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A club with this slug already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  try {
    await prisma.club.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2003") {
      return NextResponse.json({ error: "Cannot delete club — related data still exists" }, { status: 409 });
    }
    throw err;
  }
}
