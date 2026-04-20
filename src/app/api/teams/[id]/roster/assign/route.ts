import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // TEAM_MANAGER: verify this team is theirs
  if (role === Role.TEAM_MANAGER) {
    const teamId = (session!.user as Record<string, unknown>)?.teamId as string;
    if (params.id !== teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { roundId, teamDutyRoleId, assignedFamilyId, assignedFamilyName, slot = 0 } = await req.json();

  if (!roundId || !teamDutyRoleId) {
    return NextResponse.json({ error: "roundId and teamDutyRoleId are required" }, { status: 400 });
  }

  // Reject changes to locked rounds
  const round = await prisma.round.findUnique({ where: { id: roundId }, select: { isRosterLocked: true } });
  if (round?.isRosterLocked) {
    return NextResponse.json({ error: "This round is locked and cannot be modified" }, { status: 403 });
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
