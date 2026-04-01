import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveFamilies } from "@/lib/roster-algorithm";

// Public endpoint — no auth required. Token identifies the team.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const team = await prisma.team.findUnique({
    where: { availabilityToken: params.token },
    include: {
      players: {
        include: {
          player: { select: { surname: true, firstName: true, parent1: true } },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const body = await req.json();
  const { familyId, roundId, unavailable } = body as {
    familyId?: string;
    roundId?: string;
    unavailable?: boolean;
  };

  if (!familyId || !roundId || unavailable === undefined) {
    return NextResponse.json({ error: "familyId, roundId, and unavailable are required" }, { status: 400 });
  }

  // Validate familyId belongs to this team
  const families = deriveFamilies(team.players.map((tp) => tp.player));
  const validFamilyIds = new Set(families.map((f) => f.id));
  if (!validFamilyIds.has(familyId)) {
    return NextResponse.json({ error: "Invalid familyId for this team" }, { status: 400 });
  }

  // Validate roundId belongs to this team
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round || round.teamId !== team.id) {
    return NextResponse.json({ error: "Round not found" }, { status: 400 });
  }

  if (unavailable) {
    await prisma.familyUnavailability.upsert({
      where: { familyId_roundId: { familyId, roundId } },
      create: { familyId, roundId },
      update: {},
    });
  } else {
    await prisma.familyUnavailability.deleteMany({ where: { familyId, roundId } });
  }

  return NextResponse.json({ ok: true });
}
