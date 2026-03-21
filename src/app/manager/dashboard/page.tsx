"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Round {
  id: string;
  roundNumber: number;
  date: string | null;
  isBye: boolean;
  opponent: string | null;
  venue: string | null;
}

interface Team {
  id: string;
  name: string;
  ageGroup: string;
  season: { name: string; year: number };
  _count: { players: number; rounds: number };
  rounds: Round[];
}

export default function ManagerDashboard() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manager/team")
      .then((r) => r.json())
      .then((data) => { setTeam(data); setLoading(false); });
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!team) return <p className="text-red-500">No team assigned. Contact your club admin.</p>;

  const now = new Date();
  const upcomingRounds = team.rounds
    .filter((r) => !r.isBye && r.date && new Date(r.date) >= now)
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
  const nextRound = upcomingRounds[0] || null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{team.ageGroup} {team.name}</h1>
        <p className="text-gray-500 mt-1">{team.season.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Players</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-3xl font-bold">{team._count.players}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Rounds</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-3xl font-bold">{team._count.rounds}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Remaining</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-3xl font-bold">{upcomingRounds.length}</p>
          </CardContent>
        </Card>
      </div>

      {nextRound && (
        <Card className="max-w-md">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Next Game — Round {nextRound.roundNumber}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-1">
            <p className="text-sm">
              <span className="text-gray-500">Date: </span>
              {new Date(nextRound.date!).toLocaleDateString("en-AU", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
            {nextRound.opponent && (
              <p className="text-sm"><span className="text-gray-500">vs </span>{nextRound.opponent}</p>
            )}
            {nextRound.venue && (
              <p className="text-sm"><span className="text-gray-500">Venue: </span>{nextRound.venue}</p>
            )}
          </CardContent>
        </Card>
      )}

      {!nextRound && (
        <p className="text-gray-500">No upcoming rounds scheduled.</p>
      )}

      {process.env.NEXT_PUBLIC_VERCEL_ENV && process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" && (
        <p className="fixed bottom-2 right-2 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
          {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF} &middot; {process.env.NEXT_PUBLIC_VERCEL_ENV}
        </p>
      )}
    </div>
  );
}
