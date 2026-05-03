import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isSuperAdmin = session.user.role === Role.SUPER_ADMIN;
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const clubs = await prisma.club.findMany({
    where: isSuperAdmin ? {} : { id: clubId },
    orderBy: { name: "asc" },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      },
      seasons: {
        orderBy: { year: "desc" },
        include: {
          teams: {
            orderBy: [{ ageGroup: "asc" }, { name: "asc" }],
            include: {
              staff: {
                include: {
                  user: { select: { id: true, name: true, email: true, role: true } },
                },
                orderBy: [{ role: "asc" }, { createdAt: "asc" }],
              },
              players: {
                include: {
                  player: {
                    select: {
                      familyId: true,
                      family: { select: { id: true, name: true, email: true, role: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Fetch all manually granted family-team access rows for the queried clubs in one query.
  const clubIds = clubs.map((c) => c.id);
  const manualAccesses = await prisma.familyTeamAccess.findMany({
    where: { clubId: { in: clubIds } },
    select: { familyUserId: true, teamId: true },
  });

  // Forward map: familyUserId → teamId[] (used to pre-populate edit dialog checkboxes)
  const manualTeamMap = new Map<string, string[]>();
  // Inverse map: teamId → Set<familyUserId> (used to add manual-only users to team sections)
  const manualFamilyMap = new Map<string, Set<string>>();
  for (const access of manualAccesses) {
    const arr = manualTeamMap.get(access.familyUserId) ?? [];
    arr.push(access.teamId);
    manualTeamMap.set(access.familyUserId, arr);

    const set = manualFamilyMap.get(access.teamId) ?? new Set<string>();
    set.add(access.familyUserId);
    manualFamilyMap.set(access.teamId, set);
  }

  type FamilyUserEntry = {
    id: string; name: string; email: string; role: string;
    accessSource: "player" | "manual" | "both";
    manualTeamIds: string[];
  };

  const result = clubs.map((club) => {
    const admins = club.users.filter((u) => u.role === Role.ADMIN || u.role === Role.SUPER_ADMIN);

    // Fast lookup for user metadata when a manual-only family user has no player link.
    const userById = new Map(club.users.map((u) => [u.id, u]));

    const seasons = club.seasons.map((season) => ({
      id: season.id,
      name: season.name,
      year: season.year,
      teams: season.teams.map((team) => {
        const familyMap = new Map<string, FamilyUserEntry>();

        // Player-derived access
        for (const tp of team.players) {
          const fam = tp.player.family;
          if (fam && !familyMap.has(fam.id)) {
            familyMap.set(fam.id, {
              ...(fam as { id: string; name: string; email: string; role: string }),
              accessSource: "player",
              manualTeamIds: manualTeamMap.get(fam.id) ?? [],
            });
          }
        }

        // Merge manual-access users: add missing ones, upgrade "player" → "both"
        const manualUserIds = Array.from(manualFamilyMap.get(team.id) ?? []);
        for (const userId of manualUserIds) {
          const existing = familyMap.get(userId);
          if (existing) {
            existing.accessSource = "both";
          } else {
            const u = userById.get(userId);
            if (u && u.role === Role.FAMILY) {
              familyMap.set(userId, {
                id: u.id, name: u.name, email: u.email, role: u.role,
                accessSource: "manual",
                manualTeamIds: manualTeamMap.get(u.id) ?? [],
              });
            }
          }
        }

        const familyUsers = Array.from(familyMap.values())
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          id: team.id,
          name: team.name,
          ageGroup: team.ageGroup,
          staff: team.staff
            .filter((s) => s.user)
            .map((s) => ({
              id: s.id,
              role: s.role,
              user: s.user as { id: string; name: string; email: string; role: string },
            })),
          familyUsers,
        };
      }),
    }));

    const allTeams = seasons.flatMap((s) =>
      s.teams.map((t) => ({ id: t.id, name: t.name, ageGroup: t.ageGroup, seasonName: s.name }))
    );

    // A family user is unlinked only when they have no effective access from either source.
    const playerLinkedFamilyIds = new Set(
      club.seasons.flatMap((s) =>
        s.teams.flatMap((t) =>
          t.players.map((tp) => tp.player.familyId).filter(Boolean)
        )
      )
    );
    const unlinkedFamilyUsers = club.users
      .filter(
        (u) =>
          u.role === Role.FAMILY &&
          !playerLinkedFamilyIds.has(u.id) &&
          !manualTeamMap.has(u.id)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({ ...u, manualTeamIds: [] as string[] }));

    return { id: club.id, name: club.name, slug: club.slug, admins, seasons, allTeams, unlinkedFamilyUsers };
  });

  return NextResponse.json(result);
}
