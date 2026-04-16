import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role, TeamStaffRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasStaffRole } from "@/lib/team-access";

// DELETE a single vote (ADMIN / SUPER_ADMIN / TEAM_MANAGER staff role scoped to
// the vote's team). Note: deleting a vote does NOT automatically reopen a
// closed voting session — reopening is an explicit action via PUT /api/voting.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { voteId: string } },
) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role as Role | undefined;
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN && role !== Role.TEAM_MANAGER) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const vote = await prisma.vote.findUnique({
    where: { id: params.voteId },
    include: {
      votingSession: {
        include: {
          round: {
            include: {
              team: {
                select: {
                  id: true,
                  season: { select: { clubId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!vote) {
    return NextResponse.json({ error: "Vote not found" }, { status: 404 });
  }

  const voteClubId = vote.votingSession.round.team.season.clubId;
  const voteTeamId = vote.votingSession.round.team.id;

  const sessionUser = session?.user as Record<string, unknown> | undefined;
  const sessionClubId = sessionUser?.clubId as string | undefined;
  const sessionUserId = sessionUser?.id as string | undefined;

  if (role === Role.ADMIN) {
    if (!sessionClubId || sessionClubId !== voteClubId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (role === Role.TEAM_MANAGER) {
    if (!sessionUserId || !(await hasStaffRole(sessionUserId, voteTeamId, TeamStaffRole.TEAM_MANAGER))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await prisma.vote.delete({ where: { id: params.voteId } });

  return NextResponse.json({ success: true, teamId: voteTeamId });
}
