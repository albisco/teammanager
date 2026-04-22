import { NextRequest, NextResponse } from "next/server";
import { Role, TeamStaffRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  // Get club-wide roles + any roles scoped to this team, plus exclusions + team staff
  const [allRoles, teamConfigs, exclusions, staff] = await Promise.all([
    prisma.dutyRole.findMany({
      where: { clubId, OR: [{ teamId: null }, { teamId: params.id }] },
      orderBy: [{ sortOrder: "asc" }, { roleName: "asc" }],
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId: params.id },
      include: { dutyRole: true, specialists: true },
    }),
    prisma.teamDutyRoleExclusion.findMany({
      where: { teamId: params.id },
      select: { dutyRoleId: true },
    }),
    prisma.teamStaff.findMany({
      where: { teamId: params.id },
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

  // Merge: every club role appears, with team config if it exists
  const configMap = new Map(teamConfigs.map((c) => [c.dutyRoleId, c]));

  // Filter out club-level roles the team has explicitly excluded
  const visibleRoles = allRoles.filter(
    (role) => role.teamId !== null || !excludedIds.has(role.id)
  );

  const merged = visibleRoles.map((role) => {
    const config = configMap.get(role.id);
    const staffLink = role.teamStaffRole;
    const linkedStaff = staffLink ? staffByRole.get(staffLink) ?? [] : [];
    const autoFromTeamStaff = !!staffLink;
    const staffNames = linkedStaff.map((s) => s.name).join(", ");

    return {
      dutyRoleId: role.id,
      roleName: role.roleName,
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
      configured: autoFromTeamStaff ? linkedStaff.length > 0 : !!config,
      autoFromTeamStaff,
      teamStaffRole: staffLink ?? null,
    };
  });

  return NextResponse.json(merged);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { dutyRoleId, roleType, assignedPersonName, assignedFamilyId, frequencyWeeks, slots, specialists } = body;
  const slotsValue = Math.max(1, Math.min(10, parseInt(slots) || 1));

  if (!dutyRoleId || !roleType) {
    return NextResponse.json({ error: "Duty role ID and type are required" }, { status: 400 });
  }

  try {
    // Upsert: create or update team config for this role
    const existing = await prisma.teamDutyRole.findUnique({
      where: { teamId_dutyRoleId: { teamId: params.id, dutyRoleId } },
    });

    const specialistData = roleType === "SPECIALIST" && Array.isArray(specialists) && specialists.length
      ? { create: specialists.map((s: { personName: string; familyId?: string }) => ({ personName: s.personName, familyId: s.familyId || null })) }
      : undefined;

    const data = {
      roleType,
      assignedPersonName: roleType === "FIXED" ? (assignedPersonName || null) : null,
      assignedFamilyId: roleType === "FIXED" ? (assignedFamilyId || null) : null,
      frequencyWeeks: roleType === "FREQUENCY" ? (parseInt(frequencyWeeks) || 1) : 1,
      slots: slotsValue,
      specialists: specialistData,
    };

    const include = {
      dutyRole: true,
      specialists: true,
    };

    if (existing) {
      await prisma.teamDutyRoleSpecialist.deleteMany({ where: { teamDutyRoleId: existing.id } });

      const updated = await prisma.teamDutyRole.update({
        where: { id: existing.id },
        data,
        include,
      });
      return NextResponse.json(updated);
    } else {
      const created = await prisma.teamDutyRole.create({
        data: {
          teamId: params.id,
          dutyRoleId,
          ...data,
        },
        include,
      });
      return NextResponse.json(created, { status: 201 });
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This role is already configured for this team" }, { status: 409 });
    }
    throw err;
  }
}
