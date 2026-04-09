import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as Record<string, unknown>)?.teamId as string | null;
  if (!teamId) return NextResponse.json({ error: "No team assigned" }, { status: 404 });

  const [staff, players] = await Promise.all([
    prisma.teamStaff.findMany({
      where: { teamId },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId },
      select: {
        player: { select: { parent1: true, parent2: true } },
      },
    }),
  ]);

  // Collect unique parent names
  const nameSet = new Set<string>();
  for (const tp of players) {
    if (tp.player.parent1?.trim()) nameSet.add(tp.player.parent1.trim());
    if (tp.player.parent2?.trim()) nameSet.add(tp.player.parent2.trim());
  }
  const parentNames = Array.from(nameSet).sort((a, b) => a.localeCompare(b));

  const roleOrder = ["Coach", "Assistant Coach", "Team Manager"];
  const sortedStaff = staff.sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  );

  return NextResponse.json({ staff: sortedStaff, parentNames });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as Record<string, unknown>)?.teamId as string | null;
  if (!teamId) return NextResponse.json({ error: "No team assigned" }, { status: 404 });

  const { role, name } = await req.json();
  if (!role?.trim()) return NextResponse.json({ error: "Role is required" }, { status: 400 });

  if (!name?.trim()) {
    // Clear the assignment
    await prisma.teamStaff.deleteMany({ where: { teamId, role } });
    return NextResponse.json({ ok: true });
  }

  const staff = await prisma.teamStaff.upsert({
    where: { teamId_role: { teamId, role } },
    update: { name: name.trim() },
    create: { teamId, role, name: name.trim() },
  });

  return NextResponse.json(staff);
}
