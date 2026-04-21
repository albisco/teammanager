import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, TeamStaffRole } from "@prisma/client";

/**
 * Excluding a club role from a team is basic roster management — it does NOT
 * require club.allowTeamDutyRoles (that flag gates creating new team-scoped roles).
 * Any ADMIN/SUPER_ADMIN or a team's own TEAM_MANAGER may exclude roles.
 */
async function authorize(teamId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401, error: "Unauthorized" };
  const user = session.user as { id: string; role: Role; clubId?: string | null };

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { season: { select: { clubId: true } } },
  });
  if (!team) return { ok: false as const, status: 404, error: "Team not found" };
  const clubId = team.season.clubId;

  if (user.role === Role.SUPER_ADMIN) return { ok: true as const, clubId };
  if (user.role === Role.ADMIN && user.clubId === clubId) return { ok: true as const, clubId };

  if (user.role === Role.TEAM_MANAGER) {
    const staff = await prisma.teamStaff.findFirst({
      where: { userId: user.id, teamId, role: TeamStaffRole.TEAM_MANAGER },
      select: { id: true },
    });
    if (!staff) return { ok: false as const, status: 403, error: "Forbidden" };
    return { ok: true as const, clubId };
  }

  return { ok: false as const, status: 403, error: "Forbidden" };
}

// DELETE — exclude a club-level duty role from this team's roster
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; dutyRoleId: string } }
) {
  const auth = await authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId, dutyRoleId } = params;

  // Verify this is a club-level role (not team-scoped) belonging to this club
  const dutyRole = await prisma.dutyRole.findUnique({ where: { id: dutyRoleId } });
  if (!dutyRole || dutyRole.clubId !== auth.clubId || dutyRole.teamId !== null) {
    return NextResponse.json({ error: "Not found or not a club-level role" }, { status: 404 });
  }

  // Clean up TeamDutyRole config and related data if it exists
  const teamDutyRole = await prisma.teamDutyRole.findUnique({
    where: { teamId_dutyRoleId: { teamId, dutyRoleId } },
  });
  if (teamDutyRole) {
    await prisma.$transaction([
      prisma.teamDutyRoleSpecialist.deleteMany({ where: { teamDutyRoleId: teamDutyRole.id } }),
      prisma.rosterAssignment.deleteMany({ where: { teamDutyRoleId: teamDutyRole.id } }),
      prisma.familyExclusion.deleteMany({ where: { teamDutyRoleId: teamDutyRole.id } }),
      prisma.teamDutyRole.delete({ where: { id: teamDutyRole.id } }),
    ]);
  }

  // Record the exclusion so this role stays hidden for this team
  await prisma.teamDutyRoleExclusion.upsert({
    where: { teamId_dutyRoleId: { teamId, dutyRoleId } },
    create: { teamId, dutyRoleId },
    update: {},
  });

  return NextResponse.json({ success: true });
}

// DELETE with body { restore: true } — restore a previously excluded club role
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; dutyRoleId: string } }
) {
  const auth = await authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId, dutyRoleId } = params;

  await prisma.teamDutyRoleExclusion.deleteMany({
    where: { teamId, dutyRoleId },
  });

  return NextResponse.json({ success: true });
}
