import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFamilyAccessibleTeams } from "@/lib/family-access";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as Record<string, unknown>).role !== Role.FAMILY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  const clubId = (session.user as Record<string, unknown>).clubId as string | null;
  if (!clubId) {
    return NextResponse.json({ teams: [] });
  }

  const teamIds = await getFamilyAccessibleTeams(userId, clubId);
  if (!teamIds.length) {
    return NextResponse.json({ teams: [] });
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds }, season: { clubId } },
    select: { id: true, name: true, ageGroup: true },
    orderBy: [{ ageGroup: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ teams });
}
