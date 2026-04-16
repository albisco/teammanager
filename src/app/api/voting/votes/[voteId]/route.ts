import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE a single vote (ADMIN / SUPER_ADMIN / TEAM_MANAGER scoped to their team/club).
// Note: deleting a vote does NOT automatically reopen a closed voting session —
// reopening is an explicit action via PUT /api/voting.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { voteId: string } },
) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "TEAM_MANAGER") {
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
                  managerId: true,
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
  const voteTeamManagerId = vote.votingSession.round.team.managerId;

  const sessionUser = session?.user as Record<string, unknown> | undefined;
  const sessionClubId = sessionUser?.clubId as string | undefined;
  const sessionUserId = sessionUser?.id as string | undefined;

  if (role === "ADMIN") {
    if (!sessionClubId || sessionClubId !== voteClubId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (role === "TEAM_MANAGER") {
    if (!sessionUserId || voteTeamManagerId !== sessionUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await prisma.vote.delete({ where: { id: params.voteId } });

  return NextResponse.json({ success: true, teamId: voteTeamId });
}
