import { NextRequest, NextResponse } from "next/server";
import { Role, TeamStaffRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasStaffRole } from "@/lib/team-access";
import { parseIcs, mapEventsForTeam } from "@/lib/ics-parser";

async function authorize(teamId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401, error: "Unauthorized" };
  const user = session.user as { id: string; role: Role; clubId?: string | null };

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, season: { select: { clubId: true } } },
  });
  if (!team) return { ok: false as const, status: 404, error: "Team not found" };

  if (user.role === Role.SUPER_ADMIN) return { ok: true as const, team };
  if (user.role === Role.ADMIN && team.season.clubId === user.clubId) {
    return { ok: true as const, team };
  }
  if (await hasStaffRole(user.id, team.id, TeamStaffRole.TEAM_MANAGER)) {
    return { ok: true as const, team };
  }
  return { ok: false as const, status: 403, error: "Forbidden" };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const team = auth.team;

  const body = await req.json().catch(() => null) as
    | { ics?: string; sourceUrl?: string; dryRun?: boolean; teamNameOverride?: string }
    | null;
  if (!body?.ics || typeof body.ics !== "string") {
    return NextResponse.json({ error: "ics text is required" }, { status: 400 });
  }

  const events = parseIcs(body.ics);
  if (events.length === 0) {
    return NextResponse.json({ error: "No VEVENTs found in ICS payload" }, { status: 400 });
  }

  const teamName = body.teamNameOverride?.trim() || team.name;
  const mapped = mapEventsForTeam(events, teamName);

  if (body.dryRun) {
    return NextResponse.json({
      teamName,
      preview: mapped,
      sourceUrl: body.sourceUrl ?? null,
    });
  }

  let created = 0;
  let updated = 0;
  for (const row of mapped) {
    const data = {
      teamId: team.id,
      roundNumber: row.roundNumber,
      date: row.date,
      gameTime: row.gameTime,
      isBye: row.isBye,
      opponent: row.opponent,
      venue: row.venue,
      court: row.court,
      externalId: row.externalId,
    };

    const existing = await prisma.round.findFirst({
      where: {
        teamId: team.id,
        OR: [
          { externalId: row.externalId },
          { roundNumber: row.roundNumber },
        ],
      },
      select: { id: true, externalId: true },
    });

    if (existing) {
      await prisma.round.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.round.create({ data });
      created += 1;
    }
  }

  await prisma.team.update({
    where: { id: team.id },
    data: {
      fixtureSourceUrl: body.sourceUrl ?? undefined,
      fixtureSyncedAt: new Date(),
    },
  });

  return NextResponse.json({ created, updated, total: mapped.length });
}
