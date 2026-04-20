import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadTeamAvailability } from "@/lib/availability";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as Record<string, unknown> | undefined;
  if (!session || user?.role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = user?.teamId as string | null;
  if (!teamId) return NextResponse.json({ error: "No team assigned" }, { status: 404 });

  const data = await loadTeamAvailability(teamId);
  if (!data) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (!data.team.selfManaged) {
    return NextResponse.json({ error: "Not enabled for this team" }, { status: 403 });
  }

  return NextResponse.json({
    teamName: data.team.name,
    players: data.players,
    rounds: data.rounds,
    playerAvailabilityToken: data.playerAvailabilityToken,
  });
}
