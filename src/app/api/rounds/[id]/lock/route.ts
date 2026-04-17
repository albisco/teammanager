import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { locked } = await req.json();
  if (typeof locked !== "boolean") {
    return NextResponse.json({ error: "locked must be a boolean" }, { status: 400 });
  }

  const round = await prisma.round.update({
    where: { id: params.id },
    data: { isRosterLocked: locked },
    select: { id: true, isRosterLocked: true },
  });

  return NextResponse.json(round);
}
