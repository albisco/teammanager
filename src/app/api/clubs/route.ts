import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubs = await prisma.club.findMany({
    include: {
      _count: { select: { users: true, seasons: true, players: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clubs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, slug, adminName, adminEmail, adminPassword, isAdultClub, enforceFamilyVoteExclusion, maxVotesPerRound } = await req.json();

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
        enforceFamilyVoteExclusion: !!enforceFamilyVoteExclusion,
        ...(maxVotes !== undefined ? { maxVotesPerRound: maxVotes } : {}),
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
          role: "ADMIN",
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
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, name, slug, isAdultClub, enforceFamilyVoteExclusion, maxVotesPerRound } = body;
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  // ADMINs can only update their own club, and only a small allow-list of
  // club-wide voting settings (maxVotesPerRound, enforceFamilyVoteExclusion).
  if (role === "ADMIN") {
    const adminClubId = (session?.user as Record<string, unknown>)?.clubId as string | undefined;
    if (!adminClubId || adminClubId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (name !== undefined || slug !== undefined || isAdultClub !== undefined) {
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
  if (session?.user?.role !== "SUPER_ADMIN") {
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
