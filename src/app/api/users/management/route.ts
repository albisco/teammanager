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

  const result = clubs.map((club) => {
    // Club-level admins (ADMIN + SUPER_ADMIN roles)
    const admins = club.users.filter((u) => u.role === Role.ADMIN || u.role === Role.SUPER_ADMIN);

    const seasons = club.seasons.map((season) => ({
      id: season.id,
      name: season.name,
      year: season.year,
      teams: season.teams.map((team) => {
        // Deduplicate family users by id
        const familyMap = new Map<string, { id: string; name: string; email: string; role: string }>();
        for (const tp of team.players) {
          const fam = tp.player.family;
          if (fam && !familyMap.has(fam.id)) {
            familyMap.set(fam.id, fam as { id: string; name: string; email: string; role: string });
          }
        }
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
          familyUsers: Array.from(familyMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
    }));

    // Flat list of all teams for the team-assignment editor
    const allTeams = seasons.flatMap((s) =>
      s.teams.map((t) => ({ id: t.id, name: t.name, ageGroup: t.ageGroup, seasonName: s.name }))
    );

    return { id: club.id, name: club.name, slug: club.slug, admins, seasons, allTeams };
  });

  return NextResponse.json(result);
}
