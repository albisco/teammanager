import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeamDutyRoles } from "@/lib/team-access";

async function authorize(teamId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401, error: "Unauthorized" };
  const user = session.user as { id: string; role: Role; clubId?: string | null };
  return canManageTeamDutyRoles(user, teamId);
}

async function loadOwnedRole(teamId: string, roleId: string) {
  const role = await prisma.dutyRole.findUnique({ where: { id: roleId } });
  if (!role || role.teamId !== teamId) return null;
  return role;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const auth = await authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const role = await loadOwnedRole(params.id, params.roleId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { roleName, isVotingRole } = await req.json();
  if (!roleName?.trim()) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  try {
    const updated = await prisma.dutyRole.update({
      where: { id: params.roleId },
      data: {
        roleName: roleName.trim(),
        isVotingRole: isVotingRole !== undefined ? !!isVotingRole : undefined,
      },
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists for this team" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; roleId: string } }) {
  const auth = await authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const role = await loadOwnedRole(params.id, params.roleId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.dutyRole.delete({ where: { id: params.roleId } });
  return NextResponse.json({ success: true });
}
