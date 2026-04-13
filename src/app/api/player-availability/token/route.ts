import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin endpoint — generates a playerAvailabilityToken if one doesn't exist.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as Record<string, unknown>)?.role;
  if (!session || (role !== "ADMIN" && role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { playerAvailabilityToken: true },
  });

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  if (team.playerAvailabilityToken) {
    return NextResponse.json({ token: team.playerAvailabilityToken });
  }

  // Generate a new token
  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { playerAvailabilityToken: crypto.randomUUID() },
    select: { playerAvailabilityToken: true },
  });

  return NextResponse.json({ token: updated.playerAvailabilityToken });
}
