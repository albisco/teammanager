import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as Record<string, unknown> | undefined;
  if (!session || user?.role !== "TEAM_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = user?.teamId as string | null;
  if (!teamId) return NextResponse.json({ error: "No team assigned" }, { status: 404 });

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { playerAvailabilityToken: true, selfManaged: true },
  });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (!team.selfManaged) return NextResponse.json({ error: "Not enabled for this team" }, { status: 403 });

  if (team.playerAvailabilityToken) {
    return NextResponse.json({ token: team.playerAvailabilityToken });
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { playerAvailabilityToken: crypto.randomUUID() },
    select: { playerAvailabilityToken: true },
  });

  return NextResponse.json({ token: updated.playerAvailabilityToken });
}
