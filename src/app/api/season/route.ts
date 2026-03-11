import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const seasons = await prisma.season.findMany({
    include: {
      teams: {
        include: {
          rounds: { orderBy: { roundNumber: "asc" } },
          players: {
            include: { player: { select: { id: true, firstName: true, surname: true, jumperNumber: true, dateOfBirth: true, phone: true, contactEmail: true, parent1: true, parent2: true } } },
          },
          _count: { select: { players: true } },
        },
        orderBy: { ageGroup: "asc" },
      },
    },
    orderBy: { year: "desc" },
  });

  return NextResponse.json(seasons);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, year } = body;

  if (!name || !year) {
    return NextResponse.json({ error: "Name and year are required" }, { status: 400 });
  }

  const season = await prisma.season.create({
    data: { name, year: parseInt(year) },
  });

  return NextResponse.json(season, { status: 201 });
}
