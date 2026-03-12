import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const seasons = await prisma.season.findMany({
    where: { clubId },
    include: {
      teams: {
        include: {
          manager: { select: { id: true, name: true } },
          _count: { select: { players: true, rounds: true } },
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
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, year } = body;

  if (!name || !year) {
    return NextResponse.json({ error: "Name and year are required" }, { status: 400 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const season = await prisma.season.create({
    data: { name, year: parseInt(year), clubId },
  });

  return NextResponse.json(season, { status: 201 });
}
