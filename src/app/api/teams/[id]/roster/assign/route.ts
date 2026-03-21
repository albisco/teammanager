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

  // TEAM_MANAGER: verify this team is theirs
  if (role === "TEAM_MANAGER") {
    const teamId = (session!.user as Record<string, unknown>)?.teamId as string;
    if (params.id !== teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { roundId, teamDutyRoleId, assignedFamilyId, assignedFamilyName, slot = 0 } = await req.json();

  if (!roundId || !teamDutyRoleId) {
    return NextResponse.json({ error: "roundId and teamDutyRoleId are required" }, { status: 400 });
  }

  // Clear a specific slot
  if (!assignedFamilyId) {
    await prisma.rosterAssignment.deleteMany({
      where: { roundId, teamDutyRoleId, slot },
    });
    return NextResponse.json({ success: true });
  }

  // Upsert assignment for this slot
  const assignment = await prisma.rosterAssignment.upsert({
    where: { roundId_teamDutyRoleId_slot: { roundId, teamDutyRoleId, slot } },
    create: { roundId, teamDutyRoleId, assignedFamilyId, assignedFamilyName: assignedFamilyName || assignedFamilyId, slot },
    update: { assignedFamilyId, assignedFamilyName: assignedFamilyName || assignedFamilyId },
  });

  return NextResponse.json(assignment);
}
