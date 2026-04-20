import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as Record<string, unknown>)?.teamId as string;
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  if (!teamId || !clubId) {
    return NextResponse.json({ error: "No team or club assigned" }, { status: 400 });
  }

  // Get all players in this team
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { teamId },
    include: { player: true },
  });

  const players = teamPlayers.map((tp) => tp.player);
  let alreadyLinked = 0;
  let noParent = 0;

  // Filter to unlinked players with a parent1 name
  const unlinked = players.filter((p) => {
    if (p.familyId) { alreadyLinked++; return false; }
    if (!p.parent1?.trim()) { noParent++; return false; }
    return true;
  });

  if (unlinked.length === 0) {
    return NextResponse.json({
      created: 0,
      linked: 0,
      alreadyLinked,
      noParent,
    });
  }

  // Group by normalised parent1 name
  const groups = new Map<string, typeof unlinked>();
  for (const p of unlinked) {
    const key = p.parent1!.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  let created = 0;
  let linked = 0;

  // Process each family group inside a transaction
  await prisma.$transaction(async (tx) => {
    for (const [, groupPlayers] of Array.from(groups.entries())) {
      const displayName = groupPlayers[0].parent1!.trim();

      // Check if a FAMILY user with this name already exists in the club
      let familyUser = await tx.user.findFirst({
        where: { clubId, name: displayName, role: Role.FAMILY },
      });

      if (!familyUser) {
        // Use contactEmail from first player that has one, else placeholder
        const contactEmail = groupPlayers.find((p) => p.contactEmail?.trim())?.contactEmail?.trim();
        let email = contactEmail || null;

        // Ensure email is unique
        if (email) {
          const taken = await tx.user.findUnique({ where: { email } });
          if (taken) email = null;
        }
        if (!email) {
          email = `family_${uuid().slice(0, 8)}@placeholder.local`;
        }

        const passwordHash = await bcrypt.hash("NOLOGIN_" + uuid(), 10);

        familyUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: displayName,
            role: Role.FAMILY,
            clubId,
          },
        });
        created++;
      }

      // Link all players in this group
      for (const p of groupPlayers) {
        await tx.player.update({
          where: { id: p.id },
          data: { familyId: familyUser.id },
        });
        linked++;
      }
    }
  });

  return NextResponse.json({ created, linked, alreadyLinked, noParent });
}
