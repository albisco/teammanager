import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  deriveFamilies,
  generateRoster,
  resolveDisplayName,
} from "@/lib/roster-algorithm";
import { assertFamilyAccess, assertPlayerAccess, assertRole, assertTeamAccess } from "../scope";
import {
  consumeConfirmationToken,
  issueConfirmationToken,
} from "../confirmation";
import { ErrorCodes, McpError, type ToolContext, type ToolDefinition } from "../types";

/**
 * All write tools follow a two-step confirmation pattern:
 *
 *   step 1 — call without `confirm`/`confirmationToken` →
 *            returns { preview, confirmationToken, message }
 *   step 2 — call again with `confirm: true, confirmationToken: <token>` →
 *            actually persists, returns { ok: true, ... }
 *
 * This makes it impossible for a chat to silently mutate data — the LLM has to
 * explicitly opt in after seeing what will change.
 */

function isConfirmStep(input: Record<string, unknown>): boolean {
  return input.confirm === true && typeof input.confirmationToken === "string";
}

const confirmInputSchema = {
  confirm: { type: "boolean", description: "Set to true on the second call to actually commit." },
  confirmationToken: {
    type: "string",
    description: "The token returned by the preview call. Required when confirm=true.",
  },
};

/* ─── 9. generate_roster ────────────────────────────────────────────────── */

const generateRosterTool: ToolDefinition = {
  name: "generate_roster",
  description:
    "Generate (or regenerate) the duty roster for a team's future rounds. Two-step: first call returns a preview, second call with confirm=true persists. Past rounds are preserved.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
      ...confirmInputSchema,
    },
    required: ["teamId"],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    assertRole(ctx.scope, [Role.SUPER_ADMIN, Role.ADMIN, Role.TEAM_MANAGER]);
    const teamId = String(input.teamId);
    assertTeamAccess(ctx.scope, teamId);

    // Build the same input shape as the existing /api/teams/[id]/roster/generate route
    const [rounds, teamDutyRoles, teamPlayers, exclusions, unavailabilities] = await Promise.all([
      prisma.round.findMany({ where: { teamId }, orderBy: { roundNumber: "asc" } }),
      prisma.teamDutyRole.findMany({
        where: { teamId },
        include: { dutyRole: true, specialists: true },
      }),
      prisma.teamPlayer.findMany({
        where: { teamId },
        include: { player: { select: { surname: true, firstName: true, parent1: true } } },
      }),
      prisma.familyExclusion.findMany({ where: { teamDutyRole: { teamId } } }),
      prisma.familyUnavailability.findMany({ where: { round: { teamId } } }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureRounds = rounds.filter((r) => !r.date || r.date >= today);
    const pastRoundIds = rounds.filter((r) => r.date && r.date < today).map((r) => r.id);

    const activeRounds = rounds.filter((r) => !r.isBye);
    if (activeRounds.length === 0) {
      throw new McpError(ErrorCodes.InvalidParams, "No rounds found for this team. Add rounds first.");
    }
    if (teamDutyRoles.length === 0) {
      throw new McpError(ErrorCodes.InvalidParams, "No duty roles configured for this team.");
    }

    const families = deriveFamilies(teamPlayers.map((tp) => tp.player));
    const familyMap = new Map(families.map((f) => [f.id, f]));

    if (families.length === 0) {
      throw new McpError(ErrorCodes.InvalidParams, "No players on this team.");
    }

    // Inject external specialists/fixed people as synthetic families (mirrors existing API route)
    for (const tdr of teamDutyRoles) {
      if (tdr.roleType === "FIXED" && tdr.assignedFamilyId && !familyMap.has(tdr.assignedFamilyId)) {
        const extId = tdr.assignedFamilyId;
        familyMap.set(extId, { id: extId, name: tdr.assignedPersonName || extId });
        families.push(familyMap.get(extId)!);
      }
      for (const s of tdr.specialists) {
        if (s.familyId && !familyMap.has(s.familyId)) {
          familyMap.set(s.familyId, { id: s.familyId, name: s.personName });
          families.push(familyMap.get(s.familyId)!);
        }
        if (!s.familyId) {
          const extId = `external_${s.personName.toLowerCase().replace(/\s+/g, "_")}`;
          if (!familyMap.has(extId)) {
            familyMap.set(extId, { id: extId, name: s.personName });
            families.push(familyMap.get(extId)!);
          }
        }
      }
    }

    const algorithmInput = {
      rounds: futureRounds.map((r) => ({ id: r.id, roundNumber: r.roundNumber, isBye: r.isBye })),
      families,
      teamDutyRoles: teamDutyRoles.map((tdr) => ({
        id: tdr.id,
        roleName: tdr.dutyRole.roleName,
        roleType: tdr.roleType,
        assignedFamilyId: tdr.assignedFamilyId,
        frequencyWeeks: tdr.frequencyWeeks,
        slots: tdr.slots,
        specialistFamilyIds: tdr.specialists.map(
          (s) => s.familyId || `external_${s.personName.toLowerCase().replace(/\s+/g, "_")}`
        ),
      })),
      exclusions: exclusions.map((e) => ({ familyId: e.familyId, teamDutyRoleId: e.teamDutyRoleId })),
      unavailabilities: unavailabilities.map((u) => ({ familyId: u.familyId, roundId: u.roundId })),
    };

    const assignments = generateRoster(algorithmInput);

    const displayNameInput = {
      teamDutyRoles: teamDutyRoles.map((tdr) => ({
        id: tdr.id,
        roleType: tdr.roleType as "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY",
        assignedFamilyId: tdr.assignedFamilyId,
        assignedPersonName: tdr.assignedPersonName,
        specialists: tdr.specialists.map((s) => ({ personName: s.personName, familyId: s.familyId })),
      })),
      familyMap,
    };

    const previewRows = assignments.map((a) => {
      const role = teamDutyRoles.find((r) => r.id === a.teamDutyRoleId);
      const round = futureRounds.find((r) => r.id === a.roundId);
      return {
        roundNumber: round?.roundNumber,
        roleName: role?.dutyRole.roleName,
        slot: a.slot,
        familyId: a.assignedFamilyId,
        displayName: resolveDisplayName(displayNameInput, a),
      };
    });

    if (!isConfirmStep(input)) {
      const confirmationToken = issueConfirmationToken(ctx.scope.userId, "generate_roster", {
        teamId,
        assignmentsToWrite: assignments.map((a) => ({
          roundId: a.roundId,
          teamDutyRoleId: a.teamDutyRoleId,
          assignedFamilyId: a.assignedFamilyId,
          assignedFamilyName: resolveDisplayName(displayNameInput, a),
          slot: a.slot,
        })),
        futureRoundIds: futureRounds.map((r) => r.id),
        teamDutyRoleIds: teamDutyRoles.map((r) => r.id),
      });
      return {
        preview: {
          willGenerate: assignments.length,
          futureRounds: futureRounds.length,
          skippedPastRounds: pastRoundIds.length,
          assignments: previewRows,
        },
        confirmationToken,
        message: `Preview only. Call generate_roster again with confirm=true and confirmationToken='${confirmationToken}' to commit.`,
      };
    }

    const stored = consumeConfirmationToken(
      String(input.confirmationToken),
      ctx.scope.userId,
      "generate_roster"
    ) as {
      teamId: string;
      assignmentsToWrite: Array<{
        roundId: string;
        teamDutyRoleId: string;
        assignedFamilyId: string;
        assignedFamilyName: string;
        slot: number;
      }>;
      futureRoundIds: string[];
      teamDutyRoleIds: string[];
    };

    if (stored.teamId !== teamId) {
      throw new McpError(ErrorCodes.InvalidParams, "Confirmation token is for a different team");
    }

    await prisma.$transaction([
      prisma.rosterAssignment.deleteMany({
        where: {
          roundId: { in: stored.futureRoundIds },
          teamDutyRoleId: { in: stored.teamDutyRoleIds },
        },
      }),
      prisma.rosterAssignment.createMany({ data: stored.assignmentsToWrite }),
    ]);

    return {
      ok: true,
      written: stored.assignmentsToWrite.length,
      skippedPastRounds: pastRoundIds.length,
    };
  },
};

/* ─── 10. override_assignment ───────────────────────────────────────────── */

const overrideAssignment: ToolDefinition = {
  name: "override_assignment",
  description:
    "Manually override a single roster cell: set who is assigned to a specific role+slot in a specific round. Two-step (preview then confirm).",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
      roundNumber: { type: "number" },
      teamDutyRoleId: { type: "string" },
      slot: { type: "number", description: "Slot number (0 for single-slot roles)" },
      assignedFamilyId: { type: "string" },
      assignedFamilyName: {
        type: "string",
        description: "Display name to store. Optional — defaults to looked-up family name.",
      },
      ...confirmInputSchema,
    },
    required: ["teamId", "roundNumber", "teamDutyRoleId", "slot", "assignedFamilyId"],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    assertRole(ctx.scope, [Role.SUPER_ADMIN, Role.ADMIN, Role.TEAM_MANAGER]);
    const teamId = String(input.teamId);
    const roundNumber = Number(input.roundNumber);
    const teamDutyRoleId = String(input.teamDutyRoleId);
    const slot = Number(input.slot);
    const assignedFamilyId = String(input.assignedFamilyId);
    assertTeamAccess(ctx.scope, teamId);

    const round = await prisma.round.findUnique({
      where: { teamId_roundNumber: { teamId, roundNumber } },
    });
    if (!round) throw new McpError(ErrorCodes.NotFound, `Round ${roundNumber} not found`);

    const tdr = await prisma.teamDutyRole.findFirst({
      where: { id: teamDutyRoleId, teamId },
      include: { dutyRole: true, specialists: true },
    });
    if (!tdr) throw new McpError(ErrorCodes.NotFound, `Team duty role not found on this team`);

    const teamPlayers = await prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: { select: { surname: true, firstName: true, parent1: true } } },
    });
    const families = deriveFamilies(teamPlayers.map((tp) => tp.player));
    const familyMap = new Map(families.map((f) => [f.id, f]));

    const displayName =
      typeof input.assignedFamilyName === "string"
        ? input.assignedFamilyName
        : resolveDisplayName(
            {
              teamDutyRoles: [
                {
                  id: tdr.id,
                  roleType: tdr.roleType as "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY",
                  assignedFamilyId: tdr.assignedFamilyId,
                  assignedPersonName: tdr.assignedPersonName,
                  specialists: tdr.specialists.map((s) => ({
                    personName: s.personName,
                    familyId: s.familyId,
                  })),
                },
              ],
              familyMap,
            },
            { teamDutyRoleId, assignedFamilyId }
          );

    const existing = await prisma.rosterAssignment.findUnique({
      where: { roundId_teamDutyRoleId_slot: { roundId: round.id, teamDutyRoleId, slot } },
    });

    if (!isConfirmStep(input)) {
      const confirmationToken = issueConfirmationToken(ctx.scope.userId, "override_assignment", {
        roundId: round.id,
        teamDutyRoleId,
        slot,
        assignedFamilyId,
        displayName,
      });
      return {
        preview: {
          before: existing
            ? { familyId: existing.assignedFamilyId, displayName: existing.assignedFamilyName }
            : null,
          after: { familyId: assignedFamilyId, displayName },
          round: { number: round.roundNumber, date: round.date?.toISOString() ?? null },
          role: tdr.dutyRole.roleName,
          slot,
        },
        confirmationToken,
        message: `Preview only. Call override_assignment again with confirm=true and confirmationToken='${confirmationToken}' to commit.`,
      };
    }

    const stored = consumeConfirmationToken(
      String(input.confirmationToken),
      ctx.scope.userId,
      "override_assignment"
    ) as {
      roundId: string;
      teamDutyRoleId: string;
      slot: number;
      assignedFamilyId: string;
      displayName: string;
    };

    await prisma.rosterAssignment.upsert({
      where: {
        roundId_teamDutyRoleId_slot: {
          roundId: stored.roundId,
          teamDutyRoleId: stored.teamDutyRoleId,
          slot: stored.slot,
        },
      },
      update: {
        assignedFamilyId: stored.assignedFamilyId,
        assignedFamilyName: stored.displayName,
      },
      create: {
        roundId: stored.roundId,
        teamDutyRoleId: stored.teamDutyRoleId,
        slot: stored.slot,
        assignedFamilyId: stored.assignedFamilyId,
        assignedFamilyName: stored.displayName,
      },
    });

    return { ok: true };
  },
};

/* ─── 11. mark_family_unavailable ───────────────────────────────────────── */

const markFamilyUnavailable: ToolDefinition = {
  name: "mark_family_unavailable",
  description:
    "Mark a family as unavailable for a specific round so the rostering algorithm skips them. Two-step (preview then confirm). FAMILY users can only mark their own family.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string" },
      familyId: { type: "string", description: "Synthetic family id like 'family_smith'" },
      roundNumber: { type: "number" },
      ...confirmInputSchema,
    },
    required: ["teamId", "familyId", "roundNumber"],
    additionalProperties: false,
  },
  async handler(input, ctx: ToolContext) {
    const teamId = String(input.teamId);
    const familyId = String(input.familyId);
    const roundNumber = Number(input.roundNumber);
    assertTeamAccess(ctx.scope, teamId);
    // FAMILY users can only mark their own family unavailable.
    if (ctx.scope.role === Role.FAMILY) assertFamilyAccess(ctx.scope, familyId);

    const round = await prisma.round.findUnique({
      where: { teamId_roundNumber: { teamId, roundNumber } },
    });
    if (!round) throw new McpError(ErrorCodes.NotFound, `Round ${roundNumber} not found`);

    if (!isConfirmStep(input)) {
      const confirmationToken = issueConfirmationToken(
        ctx.scope.userId,
        "mark_family_unavailable",
        { roundId: round.id, familyId }
      );
      return {
        preview: {
          action: "mark_family_unavailable",
          familyId,
          round: { number: round.roundNumber, date: round.date?.toISOString() ?? null },
        },
        confirmationToken,
        message: `Preview only. Call mark_family_unavailable again with confirm=true and confirmationToken='${confirmationToken}' to commit.`,
      };
    }

    const stored = consumeConfirmationToken(
      String(input.confirmationToken),
      ctx.scope.userId,
      "mark_family_unavailable"
    ) as { roundId: string; familyId: string };

    await prisma.familyUnavailability.upsert({
      where: { familyId_roundId: { familyId: stored.familyId, roundId: stored.roundId } },
      update: {},
      create: { familyId: stored.familyId, roundId: stored.roundId },
    });

    return { ok: true };
  },
};

/* ─── 12. mark_player_unavailable ───────────────────────────────────────── */

const markPlayerUnavailable: ToolDefinition = {
  name: "mark_player_unavailable",
  description:
    "Mark a player as unavailable for a specific round. Two-step (preview then confirm). FAMILY users can only mark their own players.",
  inputSchema: {
    type: "object",
    properties: {
      playerId: { type: "string" },
      roundNumber: {
        type: "number",
        description: "The round number on the player's team.",
      },
      teamId: {
        type: "string",
        description:
          "The team the round belongs to. If a player is on multiple teams, this disambiguates.",
      },
      ...confirmInputSchema,
    },
    required: ["playerId", "roundNumber", "teamId"],
    additionalProperties: false,
  },
  async handler(input, ctx: ToolContext) {
    const playerId = String(input.playerId);
    const teamId = String(input.teamId);
    const roundNumber = Number(input.roundNumber);
    assertPlayerAccess(ctx.scope, playerId);
    assertTeamAccess(ctx.scope, teamId);

    // Confirm the player is actually on the team
    const tp = await prisma.teamPlayer.findFirst({ where: { teamId, playerId } });
    if (!tp) {
      throw new McpError(
        ErrorCodes.InvalidParams,
        `Player ${playerId} is not on team ${teamId}`
      );
    }

    const round = await prisma.round.findUnique({
      where: { teamId_roundNumber: { teamId, roundNumber } },
    });
    if (!round) throw new McpError(ErrorCodes.NotFound, `Round ${roundNumber} not found`);

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { firstName: true, surname: true },
    });

    if (!isConfirmStep(input)) {
      const confirmationToken = issueConfirmationToken(
        ctx.scope.userId,
        "mark_player_unavailable",
        { roundId: round.id, playerId }
      );
      return {
        preview: {
          action: "mark_player_unavailable",
          player: player ? `${player.firstName} ${player.surname}` : playerId,
          round: { number: round.roundNumber, date: round.date?.toISOString() ?? null },
        },
        confirmationToken,
        message: `Preview only. Call mark_player_unavailable again with confirm=true and confirmationToken='${confirmationToken}' to commit.`,
      };
    }

    const stored = consumeConfirmationToken(
      String(input.confirmationToken),
      ctx.scope.userId,
      "mark_player_unavailable"
    ) as { roundId: string; playerId: string };

    await prisma.playerUnavailability.upsert({
      where: { playerId_roundId: { playerId: stored.playerId, roundId: stored.roundId } },
      update: {},
      create: { playerId: stored.playerId, roundId: stored.roundId },
    });

    return { ok: true };
  },
};

export const writeTools: ToolDefinition[] = [
  generateRosterTool,
  overrideAssignment,
  markFamilyUnavailable,
  markPlayerUnavailable,
];
