import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roundId, teamDutyRoleId, assignedFamilyId } = await req.json();

  if (!roundId || !teamDutyRoleId) {
    return NextResponse.json({ error: "roundId and teamDutyRoleId are required" }, { status: 400 });
  }

  // Clear assignment
  if (!assignedFamilyId) {
    await prisma.rosterAssignment.deleteMany({
      where: { roundId, teamDutyRoleId },
    });
    return NextResponse.json({ success: true });
  }

  // Upsert assignment
  const assignment = await prisma.rosterAssignment.upsert({
    where: { roundId_teamDutyRoleId: { roundId, teamDutyRoleId } },
    create: { roundId, teamDutyRoleId, assignedFamilyId },
    update: { assignedFamilyId },
    include: { assignedFamily: { select: { id: true, name: true } } },
  });

  return NextResponse.json(assignment);
}
