import { NextResponse } from "next/server";
import { Role, TeamStaffRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamilyMembers, deriveFamilies } from "@/lib/roster-algorithm";
import { matchTeamStaffRole } from "@/lib/roles";

// Returns all data needed to render the manager roster page in a single request
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as Record<string, unknown>)?.teamId as string;
  if (!teamId) {
    return NextResponse.json({ error: "No team assigned" }, { status: 400 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const [
    team,
    users,
    globalRoles,
    teamDutyRoles,
    rounds,
    assignments,
    teamPlayers,
    unavailabilities,
    exclusions,
    staff,
  ] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { availabilityToken: true, name: true, ageGroup: true } }),
    prisma.user.findMany({
      where: { clubId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.dutyRole.findMany({
      where: { clubId, OR: [{ teamId: null }, { teamId }] },
      orderBy: [{ sortOrder: "asc" }, { roleName: "asc" }],
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId },
      include: {
        dutyRole: true,
        specialists: true,
      },
      orderBy: [{ dutyRole: { sortOrder: "asc" } }, { dutyRole: { roleName: "asc" } }],
    }),
    prisma.round.findMany({
      where: { teamId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, isBye: true, date: true, gameTime: true, opponent: true, venue: true, isRosterLocked: true },
    }),
    prisma.rosterAssignment.findMany({
      where: { round: { teamId } },
      select: { id: true, roundId: true, teamDutyRoleId: true, assignedFamilyId: true, assignedFamilyName: true, slot: true },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: { select: { surname: true, firstName: true, parent1: true, parent2: true } } },
    }),
    prisma.familyUnavailability.findMany({
      where: { round: { teamId } },
      select: { familyId: true, roundId: true },
    }),
    prisma.teamDutyRoleExclusion.findMany({
      where: { teamId },
      select: { dutyRoleId: true },
    }),
    prisma.teamStaff.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const staffByRole = new Map<TeamStaffRole, { id: string; name: string }[]>();
  for (const s of staff) {
    if (!s.user) continue;
    const arr = staffByRole.get(s.role) ?? [];
    arr.push({ id: s.user.id, name: s.user.name });
    staffByRole.set(s.role, arr);
  }

  const excludedIds = new Set(exclusions.map((e) => e.dutyRoleId));
  const visibleGlobalRoles = globalRoles.filter(
    (r) => r.teamId !== null || !excludedIds.has(r.id)
  );

  const families = deriveFamilies(teamPlayers.map((tp) => tp.player)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Derive family members (parents) for specialist/fixed role config
  const familyMembers = deriveFamilyMembers(
    teamPlayers.map((tp) => tp.player)
  );

  // Build assignment map and duty counts (supports both family and person assignments)
  const assignmentMap: Record<string, Array<{ familyId: string; familyName: string; slot: number }>> = {};
  const dutyCounts: Record<string, Record<string, number>> = {};
  for (const a of assignments) {
    const key = `${a.roundId}:${a.teamDutyRoleId}`;
    if (!assignmentMap[key]) assignmentMap[key] = [];
    // Skip person assignments in the family-based assignment map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((a as any).assignedPersonName) continue;
    assignmentMap[key].push({ familyId: a.assignedFamilyId ?? "", familyName: a.assignedFamilyName ?? "", slot: a.slot });
    const fId = a.assignedFamilyId ?? "";
    if (fId && !dutyCounts[fId]) dutyCounts[fId] = {};
    if (fId) dutyCounts[fId][a.teamDutyRoleId] = (dutyCounts[fId][a.teamDutyRoleId] || 0) + 1;
  }
  for (const key of Object.keys(assignmentMap)) {
    assignmentMap[key].sort((a, b) => a.slot - b.slot);
  }

  // Merge global roles with team config + auto-fill from TeamStaff for linked roles
  const configMap = new Map(teamDutyRoles.map((c) => [c.dutyRoleId, c]));
  const explicitlyLinkedStaffRoles = new Set<TeamStaffRole>(
    globalRoles.map((r) => r.teamStaffRole).filter((x): x is TeamStaffRole => !!x)
  );

  // Lazy-create TeamDutyRole rows for any visible global role that doesn't
  // have one yet — staff-linked roles get FIXED defaults, the rest ROTATING.
  // Without a TeamDutyRole, the role can't appear in the roster grid (which
  // keys assignments by teamDutyRoleId), so newly added roles wouldn't show
  // up until something else triggered creation.
  const resolveStaffLink = (role: (typeof visibleGlobalRoles)[number]): TeamStaffRole | null => {
    if (role.teamStaffRole) return role.teamStaffRole;
    const aliased = matchTeamStaffRole(role.roleName) as TeamStaffRole | null;
    if (aliased && !explicitlyLinkedStaffRoles.has(aliased)) return aliased;
    return null;
  };
  const rolesNeedingConfig = visibleGlobalRoles.filter((role) => !configMap.has(role.id));
  if (rolesNeedingConfig.length > 0) {
    await Promise.all(
      rolesNeedingConfig.map((role) => {
        const link = resolveStaffLink(role);
        const isStaffLinked = !!link && (staffByRole.get(link)?.length ?? 0) > 0;
        return prisma.teamDutyRole
          .create({
            data: {
              teamId,
              dutyRoleId: role.id,
              roleType: isStaffLinked ? "FIXED" : "ROTATING",
              slots: 1,
            },
            include: { dutyRole: true, specialists: true },
          })
          .then((created) => {
            configMap.set(role.id, created);
          })
          .catch(() => {
            return prisma.teamDutyRole
              .findUnique({
                where: { teamId_dutyRoleId: { teamId, dutyRoleId: role.id } },
                include: { dutyRole: true, specialists: true },
              })
              .then((row) => {
                if (row) configMap.set(role.id, row);
              });
          });
      })
    );
  }
  const hasCustomConfig = (config: ReturnType<typeof configMap.get> | undefined) => {
    if (!config) return false;
    return (
      config.roleType !== "ROTATING" ||
      (config.slots ?? 1) > 1 ||
      (config.frequencyWeeks ?? 1) > 1 ||
      !!config.assignedPersonName ||
      !!config.assignedFamilyId ||
      (config.specialists?.length ?? 0) > 0
    );
  };

  const teamRoles = visibleGlobalRoles.map((role) => {
    const config = configMap.get(role.id);
    let staffLink: TeamStaffRole | null = role.teamStaffRole;
    if (!staffLink) {
      const aliased = matchTeamStaffRole(role.roleName) as TeamStaffRole | null;
      if (aliased && !explicitlyLinkedStaffRoles.has(aliased)) {
        staffLink = aliased;
      }
    }
    const linkedStaff = staffLink ? staffByRole.get(staffLink) ?? [] : [];
    const autoFromTeamStaff = !!staffLink;
    const staffNames = linkedStaff.map((s) => s.name).join(", ");

    return {
      dutyRoleId: role.id,
      roleName: role.roleName,
      roleSortOrder: role.sortOrder,
      isTeamScoped: role.teamId !== null,
      teamDutyRoleId: config?.id || null,
      roleType: autoFromTeamStaff ? "FIXED" : (config?.roleType || "ROTATING"),
      assignedPersonName: autoFromTeamStaff
        ? (staffNames || null)
        : (config?.assignedPersonName || null),
      assignedFamilyId: config?.assignedFamilyId || null,
      frequencyWeeks: config?.frequencyWeeks || 1,
      slots: config?.slots || 1,
      specialists: (config?.specialists || []).map((s) => ({
        id: s.id,
        personName: s.personName,
        familyId: s.familyId,
      })),
      configured: autoFromTeamStaff ? linkedStaff.length > 0 : hasCustomConfig(config),
      autoFromTeamStaff,
      teamStaffRole: staffLink ?? null,
    };
  });

  // Set of dutyRoleIds linked to a staff role. These show as staff rows in the
  // grid (assignedName from TeamStaff), not as generic family-rotation rows.
  // Exclude them from the plain roles/allRoles lists to avoid duplicates once
  // a TeamDutyRole row has been lazy-created for them.
  const staffLinkedDutyRoleIds = new Set(
    teamRoles.filter((r) => r.autoFromTeamStaff).map((r) => r.dutyRoleId)
  );

  // All TeamDutyRole rows for this team after lazy-create, sorted by the
  // global role sortOrder so the grid matches the Duty Roles list.
  const allTeamDutyRoles = Array.from(configMap.values()).sort((a, b) => {
    const ao = a.dutyRole.sortOrder ?? 0;
    const bo = b.dutyRole.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.dutyRole.roleName.localeCompare(b.dutyRole.roleName);
  });

  return NextResponse.json({
    availabilityToken: team?.availabilityToken ?? null,
    teamName: team ? `${team.ageGroup} ${team.name}`.trim() : "",
    users,
    globalRoles: visibleGlobalRoles,
    teamRoles,
    familyMembers,
    roster: {
      rounds,
      roles: allTeamDutyRoles
        .filter((r) => !staffLinkedDutyRoleIds.has(r.dutyRoleId))
        .map((r) => ({
          id: r.id,
          roleName: r.dutyRole.roleName,
          roleType: r.roleType,
          slots: r.slots,
          sortOrder: r.dutyRole.sortOrder,
        })),
      // Also include global club roles auto-linked to Team Staff (so they show in Share Duties)
      staffRoles: teamRoles
        .filter((r) => r.autoFromTeamStaff && r.configured)
        .map((r) => ({
          id: r.teamDutyRoleId ?? r.dutyRoleId,
          roleName: r.roleName,
          roleType: "FIXED" as const,
          slots: 1,
          assignedName: r.assignedPersonName,
          sortOrder: r.roleSortOrder,
        })),
      // Combined all roles sorted by sortOrder - for displays that need merged+sorted list
      allRoles: [...allTeamDutyRoles
        .filter((r) => !staffLinkedDutyRoleIds.has(r.dutyRoleId))
        .map((r) => ({
          id: r.id,
          roleName: r.dutyRole.roleName,
          roleType: r.roleType,
          slots: r.slots,
          sortOrder: r.dutyRole.sortOrder,
          isStaffRole: false,
          assignedName: r.assignedPersonName,
        })), ...teamRoles
        .filter((r) => r.autoFromTeamStaff && r.configured)
        .map((r) => ({
          id: r.teamDutyRoleId ?? r.dutyRoleId,
          roleName: r.roleName,
          roleType: "FIXED" as const,
          slots: 1,
          sortOrder: r.roleSortOrder,
          isStaffRole: true,
          assignedName: r.assignedPersonName,
        }))]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      assignments: assignmentMap,
      // Person assignments for staff roles (roleId → assignedPersonName per round)
      personAssignments: (() => {
        const map: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of assignments as any[]) {
          if (a.assignedPersonName) {
            map[`${a.roundId}:${a.teamDutyRoleId}:${a.slot}`] = a.assignedPersonName;
          }
        }
        return map;
      })(),
      families,
      dutyCounts,
    },
    unavailabilities,
  });
}
