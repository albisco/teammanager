import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamDutyRole = await prisma.teamDutyRole.findUnique({
    where: { id: params.roleId },
    include: {
      dutyRole: true,
      specialists: true,
    },
  });

  if (!teamDutyRole || teamDutyRole.teamId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(teamDutyRole);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { roleName, roleType, assignedPersonName, assignedFamilyId, frequencyWeeks, slots, specialists } = body;
  const slotsValue = slots != null ? Math.max(1, Math.min(10, parseInt(slots) || 1)) : undefined;

  const clubId = (session!.user as Record<string, unknown>)?.clubId as string;

  try {
    // Update global role name if changed
    if (roleName) {
      const existing = await prisma.teamDutyRole.findUnique({
        where: { id: params.roleId },
        include: { dutyRole: true },
      });
      if (existing && existing.dutyRole.roleName !== roleName) {
        let dutyRole = await prisma.dutyRole.findUnique({
          where: { clubId_roleName: { clubId, roleName } },
        });
        if (!dutyRole) {
          dutyRole = await prisma.dutyRole.create({ data: { roleName, clubId } });
        }
        await prisma.teamDutyRole.update({
          where: { id: params.roleId },
          data: { dutyRoleId: dutyRole.id },
        });
      }
    }

    // Delete existing specialists before updating
    await prisma.teamDutyRoleSpecialist.deleteMany({ where: { teamDutyRoleId: params.roleId } });

    const specialistData = roleType === "SPECIALIST" && Array.isArray(specialists) && specialists.length
      ? { create: specialists.map((s: { personName: string; familyId?: string }) => ({ personName: s.personName, familyId: s.familyId || null })) }
      : undefined;

    const teamDutyRole = await prisma.teamDutyRole.update({
      where: { id: params.roleId },
      data: {
        roleType: roleType || undefined,
        assignedPersonName: roleType === "FIXED" ? (assignedPersonName || null) : null,
        assignedFamilyId: roleType === "FIXED" ? (assignedFamilyId || null) : null,
        frequencyWeeks: roleType === "FREQUENCY" ? (parseInt(frequencyWeeks) || 1) : 1,
        slots: slotsValue,
        specialists: specialistData,
      },
      include: {
        dutyRole: true,
        specialists: true,
      },
    });

    return NextResponse.json(teamDutyRole);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This role is already assigned to this team" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Clean up related data before deleting
  await prisma.teamDutyRoleSpecialist.deleteMany({ where: { teamDutyRoleId: params.roleId } });
  await prisma.rosterAssignment.deleteMany({ where: { teamDutyRoleId: params.roleId } });
  await prisma.familyExclusion.deleteMany({ where: { teamDutyRoleId: params.roleId } });
  await prisma.teamDutyRole.delete({ where: { id: params.roleId } });
  return NextResponse.json({ success: true });
}
