import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeamDutyRoles } from "@/lib/team-access";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await prisma.dutyRole.findMany({
    where: { teamId: params.id },
    orderBy: [{ sortOrder: "asc" }, { roleName: "asc" }],
  });
  return NextResponse.json(roles);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: Role; clubId?: string | null };

  const auth = await canManageTeamDutyRoles(user, params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { roleName, isVotingRole } = await req.json();
  if (!roleName?.trim()) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  const max = await prisma.dutyRole.findFirst({
    where: { clubId: auth.clubId, OR: [{ teamId: null }, { teamId: params.id }] },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    const role = await prisma.dutyRole.create({
      data: {
        roleName: roleName.trim(),
        clubId: auth.clubId,
        teamId: params.id,
        sortOrder: (max?.sortOrder ?? -1) + 1,
        isVotingRole: !!isVotingRole,
      },
    });
    return NextResponse.json(role, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists for this team" }, { status: 409 });
    }
    throw err;
  }
}
