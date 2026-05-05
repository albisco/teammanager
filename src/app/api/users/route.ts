import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role, TeamStaffRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const role = req.nextUrl.searchParams.get("role");

  const users = await prisma.user.findMany({
    where: {
      clubId,
      ...(role ? { role: role as Role } : {}),
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const body = await req.json();
  const { name, email, password, role, teamStaff: rawStaff, familyTeams: rawFamilyTeams } = body;

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  }

  const allowedRoles: Role[] = [Role.TEAM_MANAGER, Role.FAMILY, Role.ADMIN];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const parsed = parseTeamStaff(rawStaff);
  if (parsed instanceof NextResponse) return parsed;
  const staffAssignments: StaffAssignment[] = role === Role.TEAM_MANAGER ? parsed : [];

  // Validate manual family team grants
  let familyTeamIds: string[] = [];
  if (role === Role.FAMILY && rawFamilyTeams !== undefined) {
    const parsedFamilyTeams = await parseFamilyTeams(rawFamilyTeams, clubId);
    if (parsedFamilyTeams instanceof NextResponse) return parsedFamilyTeams;
    familyTeamIds = parsedFamilyTeams;
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { name: name.trim(), email: email.trim().toLowerCase(), passwordHash: hashed, role, clubId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (staffAssignments.length) {
      for (const s of staffAssignments) {
        if (s.role === TeamStaffRole.HEAD_COACH || s.role === TeamStaffRole.TEAM_MANAGER) {
          await prisma.teamStaff.deleteMany({ where: { teamId: s.teamId, role: s.role } });
        }
      }
      await prisma.teamStaff.createMany({
        data: staffAssignments.map((s) => ({ teamId: s.teamId, userId: user.id, role: s.role })),
        skipDuplicates: true,
      });
    }

    if (familyTeamIds.length) {
      await prisma.familyTeamAccess.createMany({
        data: familyTeamIds.map((teamId) => ({ familyUserId: user.id, teamId, clubId })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("User create error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
