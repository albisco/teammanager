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

/**
 * Validates that all provided team IDs belong to the given club (via their season).
 * Deduplicates the input. Returns a 400 response if any ID is outside the club.
 */
async function parseFamilyTeams(input: unknown, clubId: string): Promise<string[] | NextResponse> {
  if (!Array.isArray(input)) {
    return NextResponse.json({ error: "familyTeams must be an array" }, { status: 400 });
  }
  const ids = Array.from(
    new Set(input.filter((id): id is string => typeof id === "string" && !!id.trim()))
  );
  if (!ids.length) return [];

  const valid = await prisma.team.findMany({
    where: { id: { in: ids }, season: { clubId } },
    select: { id: true },
  });
  if (valid.length !== ids.length) {
    return NextResponse.json(
      { error: "One or more teams do not belong to your club" },
      { status: 400 }
    );
  }
  return ids;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, teamStaff: rawStaff, clubId, familyTeams: rawFamilyTeams } =
    body;

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

  const effectiveRole = role as Role | undefined;
  const staffApplies = effectiveRole === Role.TEAM_MANAGER;
  const familyApplies = effectiveRole === Role.FAMILY;

  // TeamStaff — unchanged logic
  const parsed = rawStaff === undefined ? null : parseTeamStaff(rawStaff);
  if (parsed instanceof NextResponse) return parsed;
  const staffAssignments: StaffAssignment[] = staffApplies && parsed ? parsed : [];

  // FamilyTeamAccess — only parsed when the caller supplies the field
  // SUPER_ADMIN may provide a clubId in the body; ADMIN is scoped to session clubId.
  const sessionClubId = (session.user as Record<string, unknown>)?.clubId as string | null;
  const validationClubId =
    typeof clubId === "string" && clubId ? clubId : sessionClubId ?? "";

  let familyTeamIds: string[] | null = null; // null = field absent, don't touch rows
  if (rawFamilyTeams !== undefined) {
    if (!familyApplies) {
      // Caller sent familyTeams for a non-FAMILY user — silently ignore; rows
      // will be cleared below as part of the role-change cleanup.
      familyTeamIds = [];
    } else {
      const parsedFamilyTeams = await parseFamilyTeams(rawFamilyTeams, validationClubId);
      if (parsedFamilyTeams instanceof NextResponse) return parsedFamilyTeams;
      familyTeamIds = parsedFamilyTeams;
    }
  }

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

    // TeamStaff — rewrite only when caller sent the field; clear on role change away from TM.
    if (!staffApplies) {
      await prisma.teamStaff.deleteMany({ where: { userId: params.id } });
    } else if (parsed !== null) {
      await prisma.teamStaff.deleteMany({ where: { userId: params.id } });
      if (staffAssignments.length) {
        for (const s of staffAssignments) {
          if (s.role === TeamStaffRole.HEAD_COACH || s.role === TeamStaffRole.TEAM_MANAGER) {
            await prisma.teamStaff.deleteMany({ where: { teamId: s.teamId, role: s.role } });
          }
        }
        await prisma.teamStaff.createMany({
          data: staffAssignments.map((s) => ({ teamId: s.teamId, userId: params.id, role: s.role })),
          skipDuplicates: true,
        });
      }
    }

    // FamilyTeamAccess — clear on role change away from FAMILY; replace-all when field present.
    if (!familyApplies) {
      await prisma.familyTeamAccess.deleteMany({ where: { familyUserId: params.id } });
    } else if (familyTeamIds !== null) {
      await prisma.familyTeamAccess.deleteMany({ where: { familyUserId: params.id } });
      if (familyTeamIds.length) {
        await prisma.familyTeamAccess.createMany({
          data: familyTeamIds.map((teamId) => ({
            familyUserId: params.id,
            teamId,
            clubId: validationClubId,
          })),
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

  if ((session.user as Record<string, unknown>).id === params.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
