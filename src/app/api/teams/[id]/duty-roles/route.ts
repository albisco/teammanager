import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  // Get all club-level roles
  const allRoles = await prisma.dutyRole.findMany({ where: { clubId }, orderBy: { roleName: "asc" } });

  // Get team-specific configurations
  const teamConfigs = await prisma.teamDutyRole.findMany({
    where: { teamId: params.id },
    include: {
      dutyRole: true,
      assignedUser: { select: { id: true, name: true } },
      specialists: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  // Merge: every club role appears, with team config if it exists
  const configMap = new Map(teamConfigs.map((c) => [c.dutyRoleId, c]));

  const merged = allRoles.map((role) => {
    const config = configMap.get(role.id);
    return {
      dutyRoleId: role.id,
      roleName: role.roleName,
      teamDutyRoleId: config?.id || null,
      roleType: config?.roleType || "ROTATING",
      assignedUser: config?.assignedUser || null,
      frequencyWeeks: config?.frequencyWeeks || 1,
      specialists: config?.specialists || [],
      configured: !!config,
    };
  });

  return NextResponse.json(merged);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (role === "TEAM_MANAGER") {
    const teamId = (session!.user as Record<string, unknown>)?.teamId as string;
    if (params.id !== teamId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { dutyRoleId, roleType, assignedUserId, frequencyWeeks, specialistUserIds } = body;

  if (!dutyRoleId || !roleType) {
    return NextResponse.json({ error: "Duty role ID and type are required" }, { status: 400 });
  }

  try {
    // Upsert: create or update team config for this role
    const existing = await prisma.teamDutyRole.findUnique({
      where: { teamId_dutyRoleId: { teamId: params.id, dutyRoleId } },
    });

    if (existing) {
      // Delete old specialists
      await prisma.teamDutyRoleSpecialist.deleteMany({ where: { teamDutyRoleId: existing.id } });

      const updated = await prisma.teamDutyRole.update({
        where: { id: existing.id },
        data: {
          roleType,
          assignedUserId: roleType === "FIXED" ? assignedUserId : null,
          frequencyWeeks: roleType === "FREQUENCY" ? (parseInt(frequencyWeeks) || 1) : 1,
          specialists: roleType === "SPECIALIST" && specialistUserIds?.length
            ? { create: specialistUserIds.map((userId: string) => ({ userId })) }
            : undefined,
        },
        include: {
          dutyRole: true,
          assignedUser: { select: { id: true, name: true } },
          specialists: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      return NextResponse.json(updated);
    } else {
      const created = await prisma.teamDutyRole.create({
        data: {
          teamId: params.id,
          dutyRoleId,
          roleType,
          assignedUserId: roleType === "FIXED" ? assignedUserId : null,
          frequencyWeeks: roleType === "FREQUENCY" ? (parseInt(frequencyWeeks) || 1) : 1,
          specialists: roleType === "SPECIALIST" && specialistUserIds?.length
            ? { create: specialistUserIds.map((userId: string) => ({ userId })) }
            : undefined,
        },
        include: {
          dutyRole: true,
          assignedUser: { select: { id: true, name: true } },
          specialists: { include: { user: { select: { id: true, name: true } } } },
        },
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
