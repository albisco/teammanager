import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveFamiliesWithPlayers } from "@/lib/roster-algorithm";

async function resolveTeamFamilyId(userId: string, teamId: string): Promise<string | null> {
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { teamId },
    select: { player: { select: { id: true, firstName: true, surname: true, parent1: true, familyId: true } } },
  });
  const allPlayers = teamPlayers.map((tp) => tp.player);
  const userPlayerIds = new Set(allPlayers.filter((p) => p.familyId === userId).map((p) => p.id));
  if (userPlayerIds.size === 0) return null;
  const families = deriveFamiliesWithPlayers(allPlayers);
  const match = families.find((f) => f.playerIds.some((pid) => userPlayerIds.has(pid)));
  return match?.id ?? null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;
  const teamIds = ((session.user as unknown as { familyTeams?: string[] })?.familyTeams ?? []) as string[];
  if (teamIds.length === 0) return NextResponse.json({ teams: [] });

  const [teams, allOptOutRoles, allTeamPlayers] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true, ageGroup: true },
    }),
    prisma.teamDutyRole.findMany({
      where: { teamId: { in: teamIds }, allowOptOut: true, roleType: { not: "FIXED" } },
      select: { id: true, teamId: true, dutyRole: { select: { roleName: true } } },
    }),
    prisma.teamPlayer.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        teamId: true,
        player: { select: { id: true, firstName: true, surname: true, parent1: true, familyId: true } },
      },
    }),
  ]);

  // Derive family ID per team
  const playersByTeam = new Map<string, { id: string; firstName: string; surname: string; parent1: string | null; familyId: string | null }[]>();
  for (const tp of allTeamPlayers) {
    const arr = playersByTeam.get(tp.teamId) ?? [];
    arr.push(tp.player);
    playersByTeam.set(tp.teamId, arr);
  }

  const familyIdByTeam = new Map<string, string | null>();
  for (const teamId of teamIds) {
    const players = playersByTeam.get(teamId) ?? [];
    const userPlayerIds = new Set(players.filter((p) => p.familyId === userId).map((p) => p.id));
    if (userPlayerIds.size === 0) { familyIdByTeam.set(teamId, null); continue; }
    const families = deriveFamiliesWithPlayers(players);
    const match = families.find((f) => f.playerIds.some((pid) => userPlayerIds.has(pid)));
    familyIdByTeam.set(teamId, match?.id ?? null);
  }

  // Get all derived family IDs (non-null)
  const derivedFamilyIds = Array.from(familyIdByTeam.values()).filter((id): id is string => id !== null);
  const optOutRoleIds = allOptOutRoles.map((r) => r.id);

  const exclusions = derivedFamilyIds.length > 0 && optOutRoleIds.length > 0
    ? await prisma.familyExclusion.findMany({
        where: { familyId: { in: derivedFamilyIds }, teamDutyRoleId: { in: optOutRoleIds } },
        select: { familyId: true, teamDutyRoleId: true },
      })
    : [];

  const excludedSet = new Set(exclusions.map((e) => `${e.familyId}:${e.teamDutyRoleId}`));

  const rolesByTeam = new Map<string, typeof allOptOutRoles>();
  for (const r of allOptOutRoles) {
    const arr = rolesByTeam.get(r.teamId) ?? [];
    arr.push(r);
    rolesByTeam.set(r.teamId, arr);
  }

  const result = teams
    .map((team) => {
      const familyId = familyIdByTeam.get(team.id) ?? null;
      const roles = (rolesByTeam.get(team.id) ?? []).map((r) => ({
        teamDutyRoleId: r.id,
        roleName: r.dutyRole.roleName,
        excluded: familyId ? excludedSet.has(`${familyId}:${r.id}`) : false,
      }));
      return { teamId: team.id, teamName: team.name, ageGroup: team.ageGroup, roles };
    })
    .filter((t) => t.roles.length > 0);

  return NextResponse.json({ teams: result });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { teamDutyRoleId } = await req.json();
  if (!teamDutyRoleId) return NextResponse.json({ error: "teamDutyRoleId is required" }, { status: 400 });

  const tdr = await prisma.teamDutyRole.findUnique({
    where: { id: teamDutyRoleId },
    select: { teamId: true, allowOptOut: true },
  });
  if (!tdr) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (!tdr.allowOptOut) return NextResponse.json({ error: "Opt-out not allowed for this role" }, { status: 403 });

  const familyId = await resolveTeamFamilyId(session.user.id, tdr.teamId);
  if (!familyId) return NextResponse.json({ error: "No family identity found for this team" }, { status: 400 });

  await prisma.familyExclusion.upsert({
    where: { familyId_teamDutyRoleId: { familyId, teamDutyRoleId } },
    create: { familyId, teamDutyRoleId },
    update: {},
  });

  return NextResponse.json({ excluded: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "FAMILY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { teamDutyRoleId } = await req.json();
  if (!teamDutyRoleId) return NextResponse.json({ error: "teamDutyRoleId is required" }, { status: 400 });

  const tdr = await prisma.teamDutyRole.findUnique({
    where: { id: teamDutyRoleId },
    select: { teamId: true, allowOptOut: true },
  });
  if (!tdr) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (!tdr.allowOptOut) return NextResponse.json({ error: "Opt-out not allowed for this role" }, { status: 403 });

  const familyId = await resolveTeamFamilyId(session.user.id, tdr.teamId);
  if (!familyId) return NextResponse.json({ error: "No family identity found for this team" }, { status: 400 });

  await prisma.familyExclusion.deleteMany({
    where: { familyId, teamDutyRoleId },
  });

  return NextResponse.json({ excluded: false });
}
