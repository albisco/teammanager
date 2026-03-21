import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await prisma.familyUnavailability.findMany({
    where: { round: { teamId: params.id } },
    select: { familyId: true, roundId: true },
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { familyId, roundId } = await req.json();

  // Verify round belongs to this team
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round || round.teamId !== params.id) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const record = await prisma.familyUnavailability.create({
    data: { familyId, roundId },
  });

  return NextResponse.json(record, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { familyId, roundId } = await req.json();

  // Verify round belongs to this team
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round || round.teamId !== params.id) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  await prisma.familyUnavailability.deleteMany({
    where: { familyId, roundId },
  });

  return NextResponse.json({ success: true });
}
