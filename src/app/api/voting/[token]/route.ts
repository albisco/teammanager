import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveFamiliesWithPlayers } from "@/lib/roster-algorithm";

// Public endpoint — get voting session info by QR token
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const votingSession = await prisma.votingSession.findUnique({
    where: { qrToken: params.token },
    include: {
      round: {
        include: {
          team: {
            include: {
              season: {
                include: {
                  club: { select: { name: true, logoUrl: true, isAdultClub: true, enforceFamilyVoteExclusion: true } },
                },
              },
              players: {
                include: {
                  player: {
                    select: {
                      id: true,
                      firstName: true,
                      surname: true,
                      jumperNumber: true,
                      parent1: true,
                    },
                  },
                },
              },
              staff: {
                where: { role: { in: ["HEAD_COACH", "ASSISTANT_COACH"] } },
                include: { user: { select: { name: true } } },
                orderBy: [{ role: "asc" }, { createdAt: "asc" }],
              },
            },
          },
        },
      },
    },
  });

  if (!votingSession) {
    return NextResponse.json({ error: "Voting session not found" }, { status: 404 });
  }

  const team = votingSession.round.team;
  const enforceFamilyVoteExclusion = team.season.club.enforceFamilyVoteExclusion;

  // Families rostered for this round — families the algorithm assigned or a TM
  // manually assigned. When enforcement is off we skip this work.
  let rosteredFamilies: { id: string; name: string; playerIds: string[] }[] = [];
  if (enforceFamilyVoteExclusion) {
    // Only assignments to roles marked isVotingRole determine who can cast a
    // parent vote — admins designate exactly one duty role (e.g. "Voting") as
    // the eligibility gate.
    const rosterRows = await prisma.rosterAssignment.findMany({
      where: {
        roundId: votingSession.roundId,
        teamDutyRole: { dutyRole: { isVotingRole: true } },
      },
      select: { assignedFamilyId: true },
    });
    const rosteredIds = new Set(rosterRows.map((r) => r.assignedFamilyId));
    const allFamilies = deriveFamiliesWithPlayers(
      team.players.map((tp) => ({
        id: tp.player.id,
        surname: tp.player.surname,
        firstName: tp.player.firstName,
        parent1: tp.player.parent1,
      }))
    );
    rosteredFamilies = allFamilies
      .filter((f) => rosteredIds.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const coachStaff = team.staff.map((s) => ({
    id: s.id,
    role: s.role as "HEAD_COACH" | "ASSISTANT_COACH",
    name: s.user?.name ?? s.displayName ?? "Coach",
  }));

  // Derive already-voted seats / families from deterministic voterIds.
  const existingVotes = await prisma.vote.findMany({
    where: { votingSessionId: votingSession.id },
    select: { voterId: true, voterType: true },
  });
  const coachSeatPrefix = `anon_${votingSession.id}_coachstaff_`;
  const parentFamilyPrefix = `anon_${votingSession.id}_parent_`;
  const coachSeatsVoted: string[] = [];
  const parentFamiliesVoted: string[] = [];
  const votesByType = { PARENT: 0, COACH: 0, PLAYER: 0 };
  for (const v of existingVotes) {
    votesByType[v.voterType as keyof typeof votesByType] += 1;
    if (v.voterId.startsWith(coachSeatPrefix)) {
      coachSeatsVoted.push(v.voterId.slice(coachSeatPrefix.length));
    } else if (v.voterId.startsWith(parentFamilyPrefix)) {
      parentFamiliesVoted.push(v.voterId.slice(parentFamilyPrefix.length));
    }
  }

  return NextResponse.json({
    id: votingSession.id,
    status: votingSession.status,
    club: { name: team.season.club.name, logoUrl: team.season.club.logoUrl },
    isAdultClub: team.season.club.isAdultClub,
    enforceFamilyVoteExclusion,
    round: {
      roundNumber: votingSession.round.roundNumber,
      opponent: votingSession.round.opponent,
      date: votingSession.round.date,
    },
    team: {
      name: team.name,
      ageGroup: team.ageGroup,
      seasonName: team.season.name,
      votingScheme: team.votingScheme,
      parentVoterCount: team.parentVoterCount,
      selfManaged: team.selfManaged,
    },
    players: team.players
      .map((tp) => ({
        id: tp.player.id,
        firstName: tp.player.firstName,
        surname: tp.player.surname,
        jumperNumber: tp.player.jumperNumber,
      }))
      .sort((a, b) => a.jumperNumber - b.jumperNumber),
    rosteredFamilies,
    coachStaff,
    votesByType,
    coachSeatsVoted,
    parentFamiliesVoted,
  });
}
