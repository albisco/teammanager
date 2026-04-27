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

  const { roundId, teamDutyRoleId: rawRoleId, assignedFamilyId, assignedFamilyName, assignedPersonName, slot = 0 } = await req.json();

  if (!roundId || !rawRoleId) {
    return NextResponse.json({ error: "roundId and teamDutyRoleId are required" }, { status: 400 });
  }

  // Person assignment: just name, no family
  const isPersonAssignment = !!assignedPersonName && !assignedFamilyId;

  // Reject changes to locked rounds
  const round = await prisma.round.findUnique({ where: { id: roundId }, select: { isRosterLocked: true } });
  if (round?.isRosterLocked) {
    return NextResponse.json({ error: "This round is locked and cannot be modified" }, { status: 403 });
  }

  // Resolve teamDutyRoleId. Staff-linked roles may not have a TeamDutyRole row
  // yet — the client may have received DutyRole.id as a fallback. If so, lazy-
  // create a FIXED TeamDutyRole for it here so foreign keys are satisfied.
  let teamDutyRoleId: string = rawRoleId;
  const tdr = await prisma.teamDutyRole.findUnique({ where: { id: rawRoleId }, select: { id: true } });
  if (!tdr) {
    const dutyRole = await prisma.dutyRole.findUnique({
      where: { id: rawRoleId },
      select: { id: true, clubId: true, teamId: true },
    });
    if (!dutyRole) {
      return NextResponse.json({ error: "teamDutyRoleId not found" }, { status: 400 });
    }
    // Ensure DutyRole belongs to this team (either global or team-scoped)
    if (dutyRole.teamId !== null && dutyRole.teamId !== params.id) {
      return NextResponse.json({ error: "Role does not belong to this team" }, { status: 400 });
    }
    const existingForDutyRole = await prisma.teamDutyRole.findUnique({
      where: { teamId_dutyRoleId: { teamId: params.id, dutyRoleId: dutyRole.id } },
      select: { id: true },
    });
    if (existingForDutyRole) {
      teamDutyRoleId = existingForDutyRole.id;
    } else {
      const created = await prisma.teamDutyRole.create({
        data: { teamId: params.id, dutyRoleId: dutyRole.id, roleType: "FIXED", slots: 1 },
        select: { id: true },
      });
      teamDutyRoleId = created.id;
    }
  }

  // Clear a specific slot
  if (!assignedFamilyId && !assignedPersonName) {
    await prisma.rosterAssignment.deleteMany({
      where: { roundId, teamDutyRoleId, slot },
    });
    return NextResponse.json({ success: true });
  }

  // Upsert assignment for this slot
  const existing = await prisma.rosterAssignment.findUnique({
    where: { roundId_teamDutyRoleId_slot: { roundId, teamDutyRoleId, slot } },
  });

  if (existing) {
    await prisma.rosterAssignment.update({
      where: { id: existing.id },
      data: isPersonAssignment
        ? { assignedFamilyId: null, assignedFamilyName: null, assignedPersonName }
        : { assignedFamilyId, assignedFamilyName: assignedFamilyName || assignedFamilyId, assignedPersonName: null },
    });
  } else {
    await prisma.rosterAssignment.create({
      data: isPersonAssignment
        ? { roundId, teamDutyRoleId, slot, assignedPersonName }
        : { roundId, teamDutyRoleId, assignedFamilyId, assignedFamilyName: assignedFamilyName || assignedFamilyId, slot },
    });
  }

  return NextResponse.json({ success: true });
}