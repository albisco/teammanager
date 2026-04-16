import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role, TeamStaffRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasStaffRole } from "@/lib/team-access";

// Voting admin is restricted to TeamStaffRole.TEAM_MANAGER for a specific
// team. ADMIN/SUPER_ADMIN keep global access. See plan Follow-ups — if we add
// per-club configuration for which staff roles may admin voting, update this
// function only.
async function canAdminVoting(
  userId: string | undefined,
  role: Role | undefined,
  teamId: string
): Promise<boolean> {
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) return true;
  if (role !== Role.TEAM_MANAGER || !userId) return false;
  return hasStaffRole(userId, teamId, TeamStaffRole.TEAM_MANAGER);
}

// GET voting sessions for a team
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const userId = session.user?.id;
  const role = session.user?.role as Role | undefined;
  // TEAM_MANAGER users must hold the TEAM_MANAGER staff role on this team to
  // view the voting admin data. Head coaches and assistant coaches don't see
  // this endpoint's data (their /manager/voting nav item is hidden).
  if (
    role === Role.TEAM_MANAGER &&
    (!userId || !(await hasStaffRole(userId, teamId, TeamStaffRole.TEAM_MANAGER)))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [rounds, team] = await Promise.all([
    prisma.round.findMany({
      where: { teamId },
      include: {
        votingSession: {
          include: { _count: { select: { votes: true } } },
        },
      },
      orderBy: { roundNumber: "asc" },
    }),
    prisma.team.findUnique({
      where: { id: teamId },
      select: {
        season: { select: { club: { select: { maxVotesPerRound: true } } } },
      },
    }),
  ]);

  const maxVotesPerRound = team?.season.club.maxVotesPerRound ?? null;

  return NextResponse.json({ rounds, maxVotesPerRound });
}

// POST: open voting for a round
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role as Role | undefined;

  // Coarse role gate up front — avoids leaking round existence to FAMILY /
  // anonymous callers through 404 vs 403.
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roundId } = await req.json();
  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { teamId: true },
  });
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  if (!(await canAdminVoting(userId, role, round.teamId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if session already exists
  const existing = await prisma.votingSession.findUnique({ where: { roundId } });
  if (existing) {
    return NextResponse.json({ error: "Voting session already exists for this round" }, { status: 400 });
  }

  const votingSession = await prisma.votingSession.create({
    data: { roundId, status: "OPEN" },
  });

  return NextResponse.json(votingSession, { status: 201 });
}

// PUT: close/reopen voting for a round
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role as Role | undefined;

  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { votingSessionId, status } = await req.json();
  if (!votingSessionId || !["OPEN", "CLOSED"].includes(status)) {
    return NextResponse.json({ error: "votingSessionId and valid status required" }, { status: 400 });
  }

  const existing = await prisma.votingSession.findUnique({
    where: { id: votingSessionId },
    select: { round: { select: { teamId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Voting session not found" }, { status: 404 });
  }

  if (!(await canAdminVoting(userId, role, existing.round.teamId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const votingSession = await prisma.votingSession.update({
    where: { id: votingSessionId },
    data: { status },
  });

  return NextResponse.json(votingSession);
}
