import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      season: true,
      players: {
        include: {
          player: {
            select: { id: true, firstName: true, surname: true, jumperNumber: true, dateOfBirth: true, phone: true, contactEmail: true, parent1: true, parent2: true },
          },
        },
      },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });

  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(team);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, ageGroup, votingScheme, parentVoterCount, coachVoterCount } = body;

  const team = await prisma.team.update({
    where: { id: params.id },
    data: {
      name: name || undefined,
      ageGroup: ageGroup || undefined,
      votingScheme: votingScheme || undefined,
      parentVoterCount: parentVoterCount != null ? parseInt(parentVoterCount) : undefined,
      coachVoterCount: coachVoterCount != null ? parseInt(coachVoterCount) : undefined,
    },
  });

  return NextResponse.json(team);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.team.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
