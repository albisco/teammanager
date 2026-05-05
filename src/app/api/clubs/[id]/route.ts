import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseVotingScheme } from "@/lib/voting-scheme";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== Role.SUPER_ADMIN && role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = params.id;

  if (role === Role.ADMIN) {
    const adminClubId = (session.user as Record<string, unknown>)?.clubId as string | undefined;
    if (!adminClubId || adminClubId !== clubId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const {
    name,
    slug,
    enableRoster,
    enableAwards,
    votingScheme,
    parentVoterCount,
    coachVoterCount,
    maxVotesPerRound,
    enforceFamilyVoteExclusion,
  } = body;

  if (role === Role.ADMIN) {
    const superAdminOnlyFields = ["slug", "isAdultClub", "enableAiChat", "enablePlayHq", "allowTeamDutyRoles"];
    if (superAdminOnlyFields.some((f) => body[f] !== undefined)) {
      return NextResponse.json({ error: "ADMINs may not update plan or compliance fields" }, { status: 403 });
    }
    // Validate name if provided
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
    }
    const adminFields = [name, enableRoster, enableAwards, votingScheme, parentVoterCount, coachVoterCount, maxVotesPerRound, enforceFamilyVoteExclusion];
    if (adminFields.every((f) => f === undefined)) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }
  }

  if (role === Role.SUPER_ADMIN && !name && !slug) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (name) data.name = (name as string).trim();
  if (slug && role === Role.SUPER_ADMIN) data.slug = (slug as string).toLowerCase().replace(/\s+/g, "-");
  if (enableRoster !== undefined) data.enableRoster = !!enableRoster;
  if (enableAwards !== undefined) data.enableAwards = !!enableAwards;

  if (votingScheme !== undefined) {
    const parsed = parseVotingScheme(String(votingScheme), maxVotesPerRound as number | undefined);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.message }, { status: 400 });
    }
    data.votingScheme = parsed.value;
  }

  if (parentVoterCount !== undefined) {
    const n = Number(parentVoterCount);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "parentVoterCount must be a non-negative integer" }, { status: 400 });
    }
    data.parentVoterCount = n;
  }

  if (coachVoterCount !== undefined) {
    const n = Number(coachVoterCount);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "coachVoterCount must be a non-negative integer" }, { status: 400 });
    }
    data.coachVoterCount = n;
  }

  if (maxVotesPerRound !== undefined) {
    const n = Number(maxVotesPerRound);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "maxVotesPerRound must be a positive integer" }, { status: 400 });
    }
    data.maxVotesPerRound = n;
  }

  if (enforceFamilyVoteExclusion !== undefined) {
    data.enforceFamilyVoteExclusion = !!enforceFamilyVoteExclusion;
  }

  const club = await prisma.club.update({
    where: { id: clubId },
    data,
  });

  return NextResponse.json(club);
}
