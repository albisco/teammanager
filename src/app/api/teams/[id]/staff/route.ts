import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role, TeamStaffRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Team Staff CRUD. Only club-scoped ADMIN and SUPER_ADMIN can manage staff —
 * this is where head coaches and team managers get assigned to teams.
 */

async function assertAdminForTeam(req: NextRequest, teamId: string) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role as Role | undefined;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { season: { select: { clubId: true } } },
  });
  if (!team) {
    return { error: NextResponse.json({ error: "Team not found" }, { status: 404 }), session: null };
  }
  if (role === Role.ADMIN) {
    const sessionClubId = (session?.user as Record<string, unknown>)?.clubId as string | undefined;
    if (!sessionClubId || sessionClubId !== team.season.clubId) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
    }
  }
  return { error: null, session, clubId: team.season.clubId, req };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const check = await assertAdminForTeam(req, params.id);
  if (check.error) return check.error;

  const staff = await prisma.teamStaff.findMany({
    where: { teamId: params.id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(staff);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const check = await assertAdminForTeam(req, params.id);
  if (check.error) return check.error;
  const clubId = check.clubId!;

  const body = await req.json();
  const { userId, email, name, role } = body as {
    userId?: string;
    email?: string;
    name?: string;
    role?: TeamStaffRole;
  };

  if (!role || !Object.values(TeamStaffRole).includes(role)) {
    return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
  }

  let resolvedUserId = userId;
  let tempPassword: string | undefined;

  if (!resolvedUserId) {
    if (!email?.trim()) {
      return NextResponse.json({ error: "userId or email is required" }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    // Re-use existing user in the same club if email matches.
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.clubId && existing.clubId !== clubId) {
        return NextResponse.json(
          { error: "A user with that email exists in another club" },
          { status: 409 }
        );
      }
      resolvedUserId = existing.id;
    } else {
      if (!name?.trim()) {
        return NextResponse.json(
          { error: "Name is required when inviting a new user" },
          { status: 400 }
        );
      }
      tempPassword = randomBytes(6).toString("base64url");
      const hashed = await bcrypt.hash(tempPassword, 10);
      const created = await prisma.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash: hashed,
          role: Role.TEAM_MANAGER,
          clubId,
        },
      });
      resolvedUserId = created.id;
    }
  }

  // For HEAD_COACH / TEAM_MANAGER, remove any existing slot of the same role
  // on this team (single-slot semantics, UI warns before submit).
  if (role === TeamStaffRole.HEAD_COACH || role === TeamStaffRole.TEAM_MANAGER) {
    await prisma.teamStaff.deleteMany({
      where: { teamId: params.id, role },
    });
  }

  try {
    const staffRow = await prisma.teamStaff.upsert({
      where: { teamId_userId: { teamId: params.id, userId: resolvedUserId! } },
      update: { role },
      create: { teamId: params.id, userId: resolvedUserId!, role },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json({ staff: staffRow, tempPassword }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const check = await assertAdminForTeam(req, params.id);
  if (check.error) return check.error;

  const { staffRowId } = await req.json();
  if (!staffRowId) {
    return NextResponse.json({ error: "staffRowId is required" }, { status: 400 });
  }

  const row = await prisma.teamStaff.findUnique({ where: { id: staffRowId } });
  if (!row || row.teamId !== params.id) {
    return NextResponse.json({ error: "Staff row not found" }, { status: 404 });
  }

  await prisma.teamStaff.delete({ where: { id: staffRowId } });
  return NextResponse.json({ ok: true });
}
