import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as Record<string, unknown>)?.teamId as string | null;
  if (!teamId) return NextResponse.json({ error: "No team assigned" }, { status: 404 });

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      season: { select: { id: true, name: true, year: true } },
      players: {
        include: {
          player: {
            select: {
              id: true, firstName: true, surname: true, jumperNumber: true,
              dateOfBirth: true, phone: true, contactEmail: true, parent1: true, parent2: true,
            },
          },
        },
      },
      rounds: { orderBy: { roundNumber: "asc" } },
      _count: { select: { players: true, rounds: true } },
    },
  });

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  return NextResponse.json(team);
}
