import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

/**
 * Find or create a FAMILY user for the given parent name within a club,
 * using the player's contactEmail when available.
 * Returns the family user ID, or null if no parent1 is provided.
 */
export async function findOrCreateFamily(
  clubId: string,
  parent1: string | null | undefined,
  contactEmail: string | null | undefined
): Promise<string | null> {
  if (!parent1?.trim()) return null;

  const displayName = parent1.trim();

  // Check if a FAMILY user with this name already exists in the club
  const existing = await prisma.user.findFirst({
    where: { clubId, name: displayName, role: "FAMILY" },
    select: { id: true },
  });

  if (existing) return existing.id;

  // Determine email — use contactEmail if available and not taken
  let email = contactEmail?.trim() || null;
  if (email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) email = null;
  }
  if (!email) {
    email = `family_${uuid().slice(0, 8)}@placeholder.local`;
  }

  const passwordHash = await bcrypt.hash("NOLOGIN_" + uuid(), 10);

  const familyUser = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: displayName,
      role: "FAMILY",
      clubId,
    },
  });

  return familyUser.id;
}
