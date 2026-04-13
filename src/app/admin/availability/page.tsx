"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Player {
  id: string;
  firstName: string;
  surname: string;
  jumperNumber: number;
}

interface AvailabilityEntry {
  playerId: string;
  playerName: string;
  jumperNumber: number;
  status: "AVAILABLE" | "MAYBE" | "UNAVAILABLE";
}

interface Round {
  id: string;
  roundNumber: number;
  date: string | null;
  opponent: string | null;
  venue: string | null;
  availabilities: AvailabilityEntry[];
}

interface Team {
  id: string;
  name: string;
  ageGroup: string;
}

interface Season {
  id: string;
  name: string;
  year: number;
  teams: Team[];
}

interface AvailabilityData {
  players: Player[];
  rounds: Round[];
  playerAvailabilityToken: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function StatusBadge({ status }: { status: "AVAILABLE" | "MAYBE" | "UNAVAILABLE" | "NONE" }) {
  if (status === "AVAILABLE") return <Badge className="bg-green-600 text-white">In</Badge>;
  if (status === "MAYBE") return <Badge className="bg-amber-500 text-white">Maybe</Badge>;
  if (status === "UNAVAILABLE") return <Badge variant="destructive">Out</Badge>;
  return <Badge variant="outline" className="text-gray-400">No response</Badge>;
}

export default function AvailabilityPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Guard: only adult clubs
  useEffect(() => {
    const user = session?.user as Record<string, unknown> | undefined;
    if (session && !user?.isAdultClub && user?.role !== "SUPER_ADMIN") {
      router.push("/admin/dashboard");
    }
  }, [session, router]);

  const fetchSeasons = useCallback(async () => {
    const res = await fetch("/api/season");
    if (res.ok) setSeasons(await res.json());
  }, []);

  useEffect(() => { fetchSeasons(); }, [fetchSeasons]);

  const fetchData = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/admin/availability?teamId=${teamId}`);
    if (res.ok) {
      const d: AvailabilityData = await res.json();
      setData(d);
      setToken(d.playerAvailabilityToken);
    }
  }, []);

  useEffect(() => {
    if (selectedTeam) fetchData(selectedTeam.id);
  }, [selectedTeam, fetchData]);

  async function generateToken() {
    if (!selectedTeam) return;
    const res = await fetch(`/api/player-availability/token?teamId=${selectedTeam.id}`);
    if (res.ok) {
      const { token: t } = await res.json();
      setToken(t);
      toast.success("Link generated");
    }
  }

  function getAvailabilityUrl() {
    if (!token) return "";
    return `${window.location.origin}/player-availability/${token}`;
  }

  function copyLink() {
    navigator.clipboard.writeText(getAvailabilityUrl());
    toast.success("Link copied");
  }

  function openWhatsApp() {
    const url = getAvailabilityUrl();
    const teamName = selectedTeam?.name ?? "Team";
    const message = `${teamName} — let us know if you can make it: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Player Availability</h1>

      {/* Team selector */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {seasons.map((season) =>
          season.teams.map((team) => (
            <Card
              key={team.id}
              className={`cursor-pointer transition-colors ${selectedTeam?.id === team.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => { setSelectedTeam(team); setData(null); setToken(null); }}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{team.ageGroup}</Badge>
                  <CardTitle className="text-base">{team.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-gray-400">{season.name}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {selectedTeam && (
        <div className="space-y-6">
          {/* Link sharing panel */}
          <div className="bg-card border rounded-lg p-4 space-y-3">
            <h2 className="font-semibold">Availability Link</h2>
            <p className="text-sm text-gray-500">
              Share this link with players so they can update their availability.
            </p>
            {token ? (
              <>
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-md px-3 py-2 text-sm font-mono break-all">
                  {getAvailabilityUrl()}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyLink}>Copy Link</Button>
                  <Button size="sm" onClick={openWhatsApp}>WhatsApp</Button>
                </div>
              </>
            ) : (
              <Button size="sm" onClick={generateToken}>Generate Link</Button>
            )}
          </div>

          {/* Availability summary */}
          {data && (
            <div className="space-y-6">
              {data.rounds.length === 0 ? (
                <p className="text-sm text-gray-500">No rounds scheduled yet.</p>
              ) : (
                data.rounds.map((round) => {
                  const responded = new Set(round.availabilities.map((a) => a.playerId));
                  const noResponse = data.players.filter((p) => !responded.has(p.id));
                  const inCount = round.availabilities.filter((a) => a.status === "AVAILABLE").length;
                  const maybeCount = round.availabilities.filter((a) => a.status === "MAYBE").length;
                  const outCount = round.availabilities.filter((a) => a.status === "UNAVAILABLE").length;

                  return (
                    <div key={round.id} className="bg-card border rounded-lg overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold">Round {round.roundNumber}</span>
                          {round.date && (
                            <span className="ml-2 text-sm text-gray-500">{formatDate(round.date)}</span>
                          )}
                          {round.opponent && (
                            <span className="ml-2 text-sm text-gray-500">vs {round.opponent}</span>
                          )}
                        </div>
                        <div className="flex gap-2 text-sm">
                          <span className="text-green-600 font-medium">{inCount} In</span>
                          <span className="text-amber-500 font-medium">{maybeCount} Maybe</span>
                          <span className="text-red-600 font-medium">{outCount} Out</span>
                          <span className="text-gray-400">{noResponse.length} No response</span>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {round.availabilities
                          .sort((a, b) => a.jumperNumber - b.jumperNumber)
                          .map((entry) => (
                            <div key={entry.playerId} className="flex items-center justify-between px-4 py-2">
                              <span className="text-sm">
                                <span className="font-mono text-xs text-gray-400 mr-2">#{entry.jumperNumber}</span>
                                {entry.playerName}
                              </span>
                              <StatusBadge status={entry.status} />
                            </div>
                          ))}
                        {noResponse.map((player) => (
                          <div key={player.id} className="flex items-center justify-between px-4 py-2">
                            <span className="text-sm text-gray-400">
                              <span className="font-mono text-xs mr-2">#{player.jumperNumber}</span>
                              {player.firstName} {player.surname}
                            </span>
                            <StatusBadge status="NONE" />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
