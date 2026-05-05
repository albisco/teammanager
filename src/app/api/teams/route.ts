import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const seasonId = req.nextUrl.searchParams.get("seasonId");

  const teams = await prisma.team.findMany({
    where: seasonId ? { seasonId } : undefined,
    include: {
      season: { select: { id: true, name: true, year: true } },
      players: { include: { player: true } },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
    orderBy: { ageGroup: "asc" },
  });

  return NextResponse.json(teams);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, ageGroup, seasonId } = body;

  if (!name || !ageGroup || !seasonId) {
    return NextResponse.json({ error: "Name, age group, and season are required" }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: { name, ageGroup, seasonId },
  });

  return NextResponse.json(team, { status: 201 });
}
