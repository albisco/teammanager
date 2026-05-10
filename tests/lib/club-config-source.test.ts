import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    team: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

import { getClubConfigForTeam } from "@/lib/club-config-source";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.team.findUniqueOrThrow as ReturnType<typeof vi.fn>;

function makeTeamRow(clubOverrides: Record<string, unknown> = {}) {
  return {
    season: {
      club: {
        votingScheme: [5, 4, 3, 2, 1],
        parentVoterCount: 3,
        coachVoterCount: 1,
        maxVotesPerRound: 4,
        enforceFamilyVoteExclusion: false,
        enableRoster: true,
        enableAwards: true,
        isAdultClub: false,
        ...clubOverrides,
      },
    },
  };
}

describe("getClubConfigForTeam", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  test("returns club-level config values", async () => {
    mockFindUnique.mockResolvedValue(
      makeTeamRow({
        votingScheme: [5, 4, 3, 2, 1],
        parentVoterCount: 3,
        coachVoterCount: 1,
        maxVotesPerRound: 4,
        enforceFamilyVoteExclusion: false,
        enableRoster: true,
        enableAwards: true,
        isAdultClub: false,
      })
    );

    const config = await getClubConfigForTeam("team-1");

    expect(config.votingScheme).toEqual([5, 4, 3, 2, 1]);
    expect(config.parentVoterCount).toBe(3);
    expect(config.coachVoterCount).toBe(1);
    expect(config.maxVotesPerRound).toBe(4);
    expect(config.enforceFamilyVoteExclusion).toBe(false);
    expect(config.enableRoster).toBe(true);
    expect(config.enableAwards).toBe(true);
    expect(config.isAdultClub).toBe(false);
  });

  test("returns updated club values when club config has changed", async () => {
    // Simulate a club that changed its voting scheme; team still has stale values
    // in the dead team columns — helper must still return club values
    mockFindUnique.mockResolvedValue(
      makeTeamRow({
        votingScheme: [3, 2, 1],
        parentVoterCount: 2,
        coachVoterCount: 0,
        maxVotesPerRound: 2,
        enforceFamilyVoteExclusion: true,
        enableRoster: false,
        enableAwards: false,
        isAdultClub: true,
      })
    );

    const config = await getClubConfigForTeam("team-2");

    expect(config.votingScheme).toEqual([3, 2, 1]);
    expect(config.parentVoterCount).toBe(2);
    expect(config.coachVoterCount).toBe(0);
    expect(config.enforceFamilyVoteExclusion).toBe(true);
    expect(config.enableRoster).toBe(false);
    expect(config.enableAwards).toBe(false);
    expect(config.isAdultClub).toBe(true);
  });

  test("queries team by the given team id", async () => {
    mockFindUnique.mockResolvedValue(makeTeamRow());
    await getClubConfigForTeam("my-team-id");
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "my-team-id" } })
    );
  });
});
