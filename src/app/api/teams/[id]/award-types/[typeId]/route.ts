import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAuthorized(role: string | undefined, teamId: string, sessionTeamId: string | null) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (role === "TEAM_MANAGER" && teamId === sessionTeamId) return true;
  return false;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; typeId: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const sessionTeamId = (session?.user as Record<string, unknown>)?.teamId as string | null;

  if (!isAuthorized(role, params.id, sessionTeamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, quantity } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  try {
    const awardType = await prisma.awardType.update({
      where: { id: params.typeId },
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        quantity: quantity ?? 1,
      },
    });
    return NextResponse.json(awardType);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "An award type with this name already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; typeId: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const sessionTeamId = (session?.user as Record<string, unknown>)?.teamId as string | null;

  if (!isAuthorized(role, params.id, sessionTeamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.awardType.delete({ where: { id: params.typeId } });
  return NextResponse.json({ success: true });
}
