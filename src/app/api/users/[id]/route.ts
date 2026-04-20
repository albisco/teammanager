import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role, TeamStaffRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

type StaffAssignment = { teamId: string; role: TeamStaffRole };

function parseTeamStaff(input: unknown): StaffAssignment[] | NextResponse {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    return NextResponse.json({ error: "teamStaff must be an array" }, { status: 400 });
  }
  const out: StaffAssignment[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const teamId = (item as Record<string, unknown>).teamId;
    const role = (item as Record<string, unknown>).role;
    if (typeof teamId !== "string" || !teamId.trim()) continue;
    if (typeof role !== "string" || !Object.values(TeamStaffRole).includes(role as TeamStaffRole)) {
      return NextResponse.json({ error: "Invalid staff role" }, { status: 400 });
    }
    out.push({ teamId, role: role as TeamStaffRole });
  }
  return out;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, teamStaff: rawStaff, clubId } = body;

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const isSuperAdmin = session?.user?.role === Role.SUPER_ADMIN;
  const allowedRoles: Role[] = isSuperAdmin
    ? [Role.TEAM_MANAGER, Role.FAMILY, Role.ADMIN, Role.SUPER_ADMIN]
    : [Role.TEAM_MANAGER, Role.FAMILY, Role.ADMIN];
  if (role && !allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // teamStaff is only consulted if the resulting role is TEAM_MANAGER. When a
  // user changes away from TEAM_MANAGER we clear all of their staff rows.
  const effectiveRole = role as Role | undefined;
  const staffApplies = effectiveRole === Role.TEAM_MANAGER;
  const parsed = rawStaff === undefined ? null : parseTeamStaff(rawStaff);
  if (parsed instanceof NextResponse) return parsed;
  const staffAssignments: StaffAssignment[] = staffApplies && parsed ? parsed : [];

  try {
    const data: Record<string, unknown> = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      ...(role ? { role } : {}),
      ...(clubId !== undefined ? { clubId: clubId || null } : {}),
    };

    if (password?.trim()) {
      data.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, email: true, role: true },
    });

    // Rewrite the user's TeamStaff rows only when the caller sent a staff
    // array. An absent field leaves existing assignments alone; an explicit
    // empty array clears them. Users whose role is no longer TEAM_MANAGER
    // always have their staff rows removed.
    if (!staffApplies) {
      await prisma.teamStaff.deleteMany({ where: { userId: params.id } });
    } else if (parsed !== null) {
      // Replace-all semantics.
      await prisma.teamStaff.deleteMany({ where: { userId: params.id } });
      if (staffAssignments.length) {
        for (const s of staffAssignments) {
          if (s.role === TeamStaffRole.HEAD_COACH || s.role === TeamStaffRole.TEAM_MANAGER) {
            // Single-slot: kick out any current holder of this role on the team.
            await prisma.teamStaff.deleteMany({ where: { teamId: s.teamId, role: s.role } });
          }
        }
        await prisma.teamStaff.createMany({
          data: staffAssignments.map((s) => ({ teamId: s.teamId, userId: params.id, role: s.role })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json(user);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prevent deleting yourself
  if ((session.user as Record<string, unknown>).id === params.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
