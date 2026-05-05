import { prisma } from "@/lib/prisma";

export interface ClubConfig {
  votingScheme: number[];
  parentVoterCount: number;
  coachVoterCount: number;
  maxVotesPerRound: number;
  enforceFamilyVoteExclusion: boolean;
  enableRoster: boolean;
  enableAwards: boolean;
  isAdultClub: boolean;
}

/**
 * Returns the club-level voting and feature config for the given team.
 * Always reads from the Club row — the Team columns are legacy and ignored.
 */
export async function getClubConfigForTeam(teamId: string): Promise<ClubConfig> {
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: {
      season: {
        select: {
          club: {
            select: {
              votingScheme: true,
              parentVoterCount: true,
              coachVoterCount: true,
              maxVotesPerRound: true,
              enforceFamilyVoteExclusion: true,
              enableRoster: true,
              enableAwards: true,
              isAdultClub: true,
            },
          },
        },
      },
    },
  });

  const club = team.season.club;
  return {
    votingScheme: club.votingScheme as number[],
    parentVoterCount: club.parentVoterCount,
    coachVoterCount: club.coachVoterCount,
    maxVotesPerRound: club.maxVotesPerRound,
    enforceFamilyVoteExclusion: club.enforceFamilyVoteExclusion,
    enableRoster: club.enableRoster,
    enableAwards: club.enableAwards,
    isAdultClub: club.isAdultClub,
  };
}
