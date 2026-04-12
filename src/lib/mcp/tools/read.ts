import { prisma } from "@/lib/prisma";
import { deriveFamilies } from "@/lib/roster-algorithm";
import { assertTeamAccess, teamWhereClause } from "../scope";
import { ErrorCodes, McpError, type ToolDefinition } from "../types";

/* ─── 1. list_teams ─────────────────────────────────────────────────────── */

const listTeams: ToolDefinition = {
  name: "list_teams",
  description:
    "List all teams the caller can see, scoped by role. Returns team name, age group, season, manager, player count, and round count.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async handler(_input, { scope }) {
    const teams = await prisma.team.findMany({
      where: teamWhereClause(scope),
      include: {
        season: { select: { id: true, name: true, year: true, clubId: true } },
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { players: true, rounds: true } },
      },
      orderBy: [{ season: { year: "desc" } }, { ageGroup: "asc" }, { name: "asc" }],
    });

    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      ageGroup: t.ageGroup,
      season: { id: t.season.id, name: t.season.name, year: t.season.year },
      manager: t.manager ? { id: t.manager.id, name: t.manager.name, email: t.manager.email } : null,
      playerCount: t._count.players,
      roundCount: t._count.rounds,
    }));
  },
};

/* ─── 2. get_team_roster ────────────────────────────────────────────────── */

const getTeamRoster: ToolDefinition = {
  name: "get_team_roster",
  description:
    "Get the full duty roster grid for a team: rounds, configured duty roles, all assignments, families, and per-family duty counts. Use this for big-picture roster questions.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string", description: "The team's id (use list_teams to find it)" },
    },
    required: ["teamId"],
    additionalProperties: false,
  },
  async handler(input, { scope }) {
    const teamId = String(input.teamId);
    assertTeamAccess(scope, teamId);

    const [team, rounds, teamDutyRoles, assignments, teamPlayers] = await Promise.all([
      prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, ageGroup: true, season: { select: { name: true, year: true } } },
      }),
      prisma.round.findMany({
        where: { teamId },
        orderBy: { roundNumber: "asc" },
        select: { id: true, roundNumber: true, isBye: true, date: true, opponent: true, venue: true },
      }),
      prisma.teamDutyRole.findMany({
        where: { teamId },
        include: { dutyRole: true },
        orderBy: { dutyRole: { roleName: "asc" } },
      }),
      prisma.rosterAssignment.findMany({
        where: { round: { teamId } },
        orderBy: [{ teamDutyRoleId: "asc" }, { slot: "asc" }],
      }),
      prisma.teamPlayer.findMany({
        where: { teamId },
        include: { player: { select: { surname: true, firstName: true, parent1: true } } },
      }),
    ]);

    if (!team) throw new McpError(ErrorCodes.NotFound, `Team ${teamId} not found`);

    const families = deriveFamilies(teamPlayers.map((tp) => tp.player));

    // Build assignment map: roundId:teamDutyRoleId -> [slots]
    const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
    const dutyCounts: Record<string, Record<string, number>> = {};
    for (const a of assignments) {
      const key = `${a.roundId}:${a.teamDutyRoleId}`;
      if (!assignmentMap[key]) assignmentMap[key] = [];
      assignmentMap[key].push({
        familyId: a.assignedFamilyId,
        familyName: a.assignedFamilyName,
        slot: a.slot,
      });
      if (!dutyCounts[a.assignedFamilyId]) dutyCounts[a.assignedFamilyId] = {};
      dutyCounts[a.assignedFamilyId][a.teamDutyRoleId] =
        (dutyCounts[a.assignedFamilyId][a.teamDutyRoleId] || 0) + 1;
    }

    return {
      team: {
        id: team.id,
        name: team.name,
        ageGroup: team.ageGroup,
        season: team.season,
      },
      rounds: rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        isBye: r.isBye,
        date: r.date?.toISOString() ?? null,
        opponent: r.opponent,
        venue: r.venue,
      })),
      roles: teamDutyRoles.map((r) => ({
        id: r.id,
        roleName: r.dutyRole.roleName,
        roleType: r.roleType,
        slots: r.slots,
      })),
      assignments: assignmentMap,
      families: families.sort((a, b) => a.name.localeCompare(b.name)),
      dutyCounts,
    };
  },
};

/* ─── 3. get_next_round_duties ──────────────────────────────────────────── */

const getNextRoundDuties: ToolDefinition = {
  name: "get_next_round_duties",
  description:
    "Get the next upcoming non-bye round for a team and the duty assignments for that round, grouped by role name. Use this for 'who's on duty next week' style questions.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
    },
    required: ["teamId"],
    additionalProperties: false,
  },
  async handler(input, { scope }) {
    const teamId = String(input.teamId);
    assertTeamAccess(scope, teamId);

    const now = new Date();
    const rounds = await prisma.round.findMany({
      where: { teamId, isBye: false, date: { not: null } },
      orderBy: { date: "asc" },
      select: { id: true, roundNumber: true, date: true, opponent: true, venue: true },
    });
    const nextRound = rounds.find((r) => r.date! >= now) ?? null;
    if (!nextRound) return { round: null, duties: [] };

    const assignments = await prisma.rosterAssignment.findMany({
      where: { roundId: nextRound.id },
      include: { teamDutyRole: { include: { dutyRole: true } } },
      orderBy: { slot: "asc" },
    });

    const roleMap = new Map<string, string[]>();
    for (const a of assignments) {
      const roleName = a.teamDutyRole.dutyRole.roleName;
      if (!roleMap.has(roleName)) roleMap.set(roleName, []);
      roleMap.get(roleName)!.push(a.assignedFamilyName);
    }

    return {
      round: {
        id: nextRound.id,
        roundNumber: nextRound.roundNumber,
        date: nextRound.date!.toISOString(),
        opponent: nextRound.opponent,
        venue: nextRound.venue,
      },
      duties: Array.from(roleMap.entries()).map(([roleName, names]) => ({ roleName, names })),
    };
  },
};

/* ─── 4. get_round_duties ───────────────────────────────────────────────── */

const getRoundDuties: ToolDefinition = {
  name: "get_round_duties",
  description:
    "Get duty assignments for a specific round number on a team. Returns each role with the assigned family/person display name.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
      roundNumber: { type: "number", description: "The round number (e.g. 8)" },
    },
    required: ["teamId", "roundNumber"],
    additionalProperties: false,
  },
  async handler(input, { scope }) {
    const teamId = String(input.teamId);
    const roundNumber = Number(input.roundNumber);
    assertTeamAccess(scope, teamId);

    const round = await prisma.round.findUnique({
      where: { teamId_roundNumber: { teamId, roundNumber } },
      select: { id: true, roundNumber: true, isBye: true, date: true, opponent: true, venue: true },
    });
    if (!round) {
      throw new McpError(ErrorCodes.NotFound, `Round ${roundNumber} not found for team ${teamId}`);
    }

    const assignments = await prisma.rosterAssignment.findMany({
      where: { roundId: round.id },
      include: { teamDutyRole: { include: { dutyRole: true } } },
      orderBy: [{ teamDutyRole: { dutyRole: { roleName: "asc" } } }, { slot: "asc" }],
    });

    return {
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        isBye: round.isBye,
        date: round.date?.toISOString() ?? null,
        opponent: round.opponent,
        venue: round.venue,
      },
      assignments: assignments.map((a) => ({
        roleName: a.teamDutyRole.dutyRole.roleName,
        roleType: a.teamDutyRole.roleType,
        slot: a.slot,
        familyId: a.assignedFamilyId,
        displayName: a.assignedFamilyName,
      })),
    };
  },
};

/* ─── 5. get_family_duty_history ────────────────────────────────────────── */

const getFamilyDutyHistory: ToolDefinition = {
  name: "get_family_duty_history",
  description:
    "Get per-family duty counts for a team, broken down by role. Use this for fairness questions like 'who's done the most canteen?' or 'who's been skipped?'.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
      familyId: {
        type: "string",
        description: "Optional. If provided, returns the breakdown for just this family.",
      },
    },
    required: ["teamId"],
    additionalProperties: false,
  },
  async handler(input, { scope }) {
    const teamId = String(input.teamId);
    const filterFamilyId = input.familyId ? String(input.familyId) : null;
    assertTeamAccess(scope, teamId);

    const [teamDutyRoles, assignments, teamPlayers] = await Promise.all([
      prisma.teamDutyRole.findMany({
        where: { teamId },
        include: { dutyRole: true },
      }),
      prisma.rosterAssignment.findMany({
        where: { round: { teamId }, ...(filterFamilyId ? { assignedFamilyId: filterFamilyId } : {}) },
      }),
      prisma.teamPlayer.findMany({
        where: { teamId },
        include: { player: { select: { surname: true, firstName: true, parent1: true } } },
      }),
    ]);

    const families = deriveFamilies(teamPlayers.map((tp) => tp.player));
    const familyMap = new Map(families.map((f) => [f.id, f.name]));

    type FamilyStats = { familyId: string; familyName: string; total: number; byRole: Record<string, number> };
    const stats: Record<string, FamilyStats> = {};

    for (const a of assignments) {
      const role = teamDutyRoles.find((r) => r.id === a.teamDutyRoleId);
      const roleName = role?.dutyRole.roleName ?? "Unknown";
      if (!stats[a.assignedFamilyId]) {
        stats[a.assignedFamilyId] = {
          familyId: a.assignedFamilyId,
          familyName: familyMap.get(a.assignedFamilyId) ?? a.assignedFamilyName ?? a.assignedFamilyId,
          total: 0,
          byRole: {},
        };
      }
      stats[a.assignedFamilyId].total++;
      stats[a.assignedFamilyId].byRole[roleName] = (stats[a.assignedFamilyId].byRole[roleName] || 0) + 1;
    }

    return Object.values(stats).sort((a, b) => b.total - a.total);
  },
};

/* ─── 6. list_unavailabilities ──────────────────────────────────────────── */

const listUnavailabilities: ToolDefinition = {
  name: "list_unavailabilities",
  description:
    "List all family and player unavailabilities for a team, joined to round numbers. Use this to find out who can't make a given round.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
    },
    required: ["teamId"],
    additionalProperties: false,
  },
  async handler(input, { scope }) {
    const teamId = String(input.teamId);
    assertTeamAccess(scope, teamId);

    const [familyUn, playerUn] = await Promise.all([
      prisma.familyUnavailability.findMany({
        where: { round: { teamId } },
        include: { round: { select: { id: true, roundNumber: true, date: true } } },
      }),
      prisma.playerUnavailability.findMany({
        where: { round: { teamId } },
        include: {
          round: { select: { id: true, roundNumber: true, date: true } },
          player: { select: { id: true, firstName: true, surname: true } },
        },
      }),
    ]);

    return {
      familyUnavailabilities: familyUn.map((u) => ({
        familyId: u.familyId,
        roundId: u.round.id,
        roundNumber: u.round.roundNumber,
        roundDate: u.round.date?.toISOString() ?? null,
      })),
      playerUnavailabilities: playerUn.map((u) => ({
        playerId: u.player.id,
        playerName: `${u.player.firstName} ${u.player.surname}`,
        roundId: u.round.id,
        roundNumber: u.round.roundNumber,
        roundDate: u.round.date?.toISOString() ?? null,
      })),
    };
  },
};

/* ─── 7. list_duty_roles ────────────────────────────────────────────────── */

const listDutyRoles: ToolDefinition = {
  name: "list_duty_roles",
  description:
    "List the configured duty roles for a team with their type (FIXED/SPECIALIST/ROTATING/FREQUENCY), number of slots, frequency, fixed assignees, and specialists. Use this to explain how the rostering rules are set up.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
    },
    required: ["teamId"],
    additionalProperties: false,
  },
  async handler(input, { scope }) {
    const teamId = String(input.teamId);
    assertTeamAccess(scope, teamId);

    const teamDutyRoles = await prisma.teamDutyRole.findMany({
      where: { teamId },
      include: { dutyRole: true, specialists: true },
      orderBy: { dutyRole: { roleName: "asc" } },
    });

    return teamDutyRoles.map((tdr) => ({
      id: tdr.id,
      roleName: tdr.dutyRole.roleName,
      roleType: tdr.roleType,
      slots: tdr.slots,
      frequencyWeeks: tdr.frequencyWeeks,
      assignedPersonName: tdr.assignedPersonName,
      assignedFamilyId: tdr.assignedFamilyId,
      specialists: tdr.specialists.map((s) => ({
        personName: s.personName,
        familyId: s.familyId,
      })),
    }));
  },
};

/* ─── 8. explain_assignment ─────────────────────────────────────────────── */

const explainAssignment: ToolDefinition = {
  name: "explain_assignment",
  description:
    "Explain why a particular family is assigned to a duty in a round. Returns the role config, the eligible family pool (filtered by exclusions and unavailabilities), and recent history of the same role. Use this for 'why was X assigned?' questions.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
      roundNumber: { type: "number" },
      teamDutyRoleId: { type: "string" },
    },
    required: ["teamId", "roundNumber", "teamDutyRoleId"],
    additionalProperties: false,
  },
  async handler(input, { scope }) {
    const teamId = String(input.teamId);
    const roundNumber = Number(input.roundNumber);
    const teamDutyRoleId = String(input.teamDutyRoleId);
    assertTeamAccess(scope, teamId);

    const round = await prisma.round.findUnique({
      where: { teamId_roundNumber: { teamId, roundNumber } },
    });
    if (!round) throw new McpError(ErrorCodes.NotFound, `Round ${roundNumber} not found`);

    const tdr = await prisma.teamDutyRole.findFirst({
      where: { id: teamDutyRoleId, teamId },
      include: { dutyRole: true, specialists: true },
    });
    if (!tdr) throw new McpError(ErrorCodes.NotFound, `Team duty role not found on this team`);

    const [assignments, exclusions, familyUn, teamPlayers, recentHistory] = await Promise.all([
      prisma.rosterAssignment.findMany({
        where: { roundId: round.id, teamDutyRoleId },
        orderBy: { slot: "asc" },
      }),
      prisma.familyExclusion.findMany({ where: { teamDutyRoleId } }),
      prisma.familyUnavailability.findMany({ where: { roundId: round.id } }),
      prisma.teamPlayer.findMany({
        where: { teamId },
        include: { player: { select: { surname: true, firstName: true, parent1: true } } },
      }),
      prisma.rosterAssignment.findMany({
        where: { teamDutyRoleId },
        include: { round: { select: { roundNumber: true, date: true } } },
        orderBy: { round: { roundNumber: "desc" } },
        take: 10,
      }),
    ]);

    const families = deriveFamilies(teamPlayers.map((tp) => tp.player));
    const familyMap = new Map(families.map((f) => [f.id, f.name]));

    const excludedSet = new Set(exclusions.map((e) => e.familyId));
    const unavailableSet = new Set(familyUn.map((u) => u.familyId));

    const eligiblePool = (
      tdr.roleType === "SPECIALIST"
        ? families.filter((f) => tdr.specialists.some((s) => s.familyId === f.id))
        : families
    ).map((f) => ({
      familyId: f.id,
      familyName: f.name,
      excluded: excludedSet.has(f.id),
      unavailable: unavailableSet.has(f.id),
      eligible: !excludedSet.has(f.id) && !unavailableSet.has(f.id),
    }));

    return {
      round: { roundNumber: round.roundNumber, date: round.date?.toISOString() ?? null },
      role: {
        id: tdr.id,
        roleName: tdr.dutyRole.roleName,
        roleType: tdr.roleType,
        slots: tdr.slots,
        frequencyWeeks: tdr.frequencyWeeks,
      },
      currentAssignments: assignments.map((a) => ({
        slot: a.slot,
        familyId: a.assignedFamilyId,
        displayName: a.assignedFamilyName,
        familyName: familyMap.get(a.assignedFamilyId) ?? a.assignedFamilyName,
      })),
      eligiblePool,
      excludedFamilies: Array.from(excludedSet),
      familiesUnavailableThisRound: Array.from(unavailableSet),
      recentHistory: recentHistory.map((h) => ({
        roundNumber: h.round.roundNumber,
        date: h.round.date?.toISOString() ?? null,
        familyId: h.assignedFamilyId,
        displayName: h.assignedFamilyName,
      })),
    };
  },
};

export const readTools: ToolDefinition[] = [
  listTeams,
  getTeamRoster,
  getNextRoundDuties,
  getRoundDuties,
  getFamilyDutyHistory,
  listUnavailabilities,
  listDutyRoles,
  explainAssignment,
];
