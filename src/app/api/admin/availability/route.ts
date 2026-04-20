import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadTeamAvailability } from "@/lib/availability";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as Record<string, unknown>)?.role;
  if (!session || (role !== Role.ADMIN && role !== Role.SUPER_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

  const data = await loadTeamAvailability(teamId);
  if (!data) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  return NextResponse.json({
    players: data.players,
    rounds: data.rounds,
    playerAvailabilityToken: data.playerAvailabilityToken,
  });
}
