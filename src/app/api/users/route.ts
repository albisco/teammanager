import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const role = req.nextUrl.searchParams.get("role");

  const users = await prisma.user.findMany({
    where: {
      clubId,
      ...(role ? { role: role as import("@prisma/client").Role } : {}),
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const { name, email, password, role, teamId } = await req.json();

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  }

  const allowedRoles = ["TEAM_MANAGER", "FAMILY", "ADMIN"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { name: name.trim(), email: email.trim().toLowerCase(), passwordHash: hashed, role, clubId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (role === "TEAM_MANAGER" && teamId) {
      await prisma.team.update({ where: { id: teamId }, data: { managerId: user.id } });
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
