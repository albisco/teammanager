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

/**
 * Normalize and validate an optional teamStaff array from the request body.
 * Returns either a cleaned array or a 400 NextResponse.
 */
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const body = await req.json();
  const { name, email, password, role, teamStaff: rawStaff } = body;

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  }

  const allowedRoles: Role[] = [Role.TEAM_MANAGER, Role.FAMILY, Role.ADMIN];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const parsed = parseTeamStaff(rawStaff);
  if (parsed instanceof NextResponse) return parsed;
  // Team staff only applies to TEAM_MANAGER users. Silently ignore for others.
  const staffAssignments: StaffAssignment[] = role === Role.TEAM_MANAGER ? parsed : [];

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { name: name.trim(), email: email.trim().toLowerCase(), passwordHash: hashed, role, clubId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (staffAssignments.length) {
      // For HEAD_COACH / TEAM_MANAGER slots, clear any existing holder on the
      // same team so single-slot semantics hold (the UI warns before submit).
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
