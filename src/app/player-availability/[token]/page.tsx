"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ClubLogo } from "@/components/club-logo";

type AvailabilityStatus = "AVAILABLE" | "MAYBE" | "UNAVAILABLE";

interface Player {
  id: string;
  firstName: string;
  surname: string;
  jumperNumber: number;
}

interface Round {
  id: string;
  roundNumber: number;
  date: string | null;
  gameTime: string | null;
  isBye: boolean;
}

interface TeamData {
  club: { name: string; logoUrl: string | null };
  teamName: string;
  ageGroup: string;
  players: Player[];
  rounds: Round[];
  availabilities: { playerId: string; roundId: string; status: AvailabilityStatus }[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function PlayerAvailabilityPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AvailabilityStatus>>({});
  const [savingRoundId, setSavingRoundId] = useState<string | null>(null);
  const [savedRoundId, setSavedRoundId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/player-availability/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((d: TeamData) => setData(d))
      .catch(() => setError("Team not found. Check your link and try again."));
  }, [token]);

  // When player selection changes, load their existing responses
  useEffect(() => {
    if (!data || !selectedPlayerId) {
      setStatuses({});
      return;
    }
    const playerStatuses: Record<string, AvailabilityStatus> = {};
    data.availabilities
      .filter((a) => a.playerId === selectedPlayerId)
      .forEach((a) => { playerStatuses[a.roundId] = a.status; });
    setStatuses(playerStatuses);
  }, [data, selectedPlayerId]);

  const setStatus = useCallback(
    async (roundId: string, newStatus: AvailabilityStatus) => {
      if (!selectedPlayerId) return;

      setSavingRoundId(roundId);
      setSavedRoundId(null);

      const prevStatus = statuses[roundId];

      // Optimistic update
      setStatuses((prev) => ({ ...prev, [roundId]: newStatus }));

      try {
        const res = await fetch(`/api/player-availability/${token}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: selectedPlayerId, roundId, status: newStatus }),
        });

        if (!res.ok) {
          // Revert on failure
          setStatuses((prev) => {
            const next = { ...prev };
            if (prevStatus) {
              next[roundId] = prevStatus;
            } else {
              delete next[roundId];
            }
            return next;
          });
        } else {
          setSavedRoundId(roundId);
          setTimeout(() => setSavedRoundId(null), 2000);
        }
      } catch {
        // Revert on error
        setStatuses((prev) => {
          const next = { ...prev };
          if (prevStatus) {
            next[roundId] = prevStatus;
          } else {
            delete next[roundId];
          }
          return next;
        });
      } finally {
        setSavingRoundId(null);
      }
    },
    [selectedPlayerId, token, statuses]
  );

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const activeRounds = data.rounds.filter((r) => !r.isBye);

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center">
      <div className="flex flex-col items-center mt-2 mb-4">
        <ClubLogo name={data.club.name} logoUrl={data.club.logoUrl} size="hero" />
        <p className="mt-2 text-sm font-medium text-gray-700">{data.club.name}</p>
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary">{data.ageGroup}</Badge>
          </div>
          <CardTitle>{data.teamName}</CardTitle>
          <CardDescription>Let us know which rounds you can make it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Player selector */}
          <div className="space-y-2">
            <Label htmlFor="player-select">Who are you?</Label>
            <select
              id="player-select"
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select your name...</option>
              {data.players.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.jumperNumber} {p.firstName} {p.surname}
                </option>
              ))}
            </select>
          </div>

          {/* Round availability */}
          {selectedPlayerId && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 font-medium">
                Tap your status for each round. Changes save automatically.
              </p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
                {activeRounds.map((round) => {
                  const currentStatus = statuses[round.id];
                  const isSaving = savingRoundId === round.id;
                  const justSaved = savedRoundId === round.id;

                  return (
                    <div key={round.id} className="px-4 py-3 bg-white">
                      <div className="flex flex-col gap-0.5 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">R{round.roundNumber}</span>
                          {round.date && (
                            <span className="text-xs text-gray-500">{formatDate(round.date)}</span>
                          )}
                          {round.gameTime && (
                            <span className="text-xs text-gray-500">{round.gameTime}</span>
                          )}
                          {isSaving && <span className="text-xs text-gray-400 ml-auto">Saving...</span>}
                          {justSaved && !isSaving && <span className="text-xs text-green-600 ml-auto">Saved ✓</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setStatus(round.id, "AVAILABLE")}
                          disabled={isSaving}
                          className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                            currentStatus === "AVAILABLE"
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white text-gray-600 border-gray-200 hover:bg-green-50 hover:border-green-300"
                          }`}
                        >
                          In
                        </button>
                        <button
                          onClick={() => setStatus(round.id, "MAYBE")}
                          disabled={isSaving}
                          className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                            currentStatus === "MAYBE"
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-white text-gray-600 border-gray-200 hover:bg-amber-50 hover:border-amber-300"
                          }`}
                        >
                          Maybe
                        </button>
                        <button
                          onClick={() => setStatus(round.id, "UNAVAILABLE")}
                          disabled={isSaving}
                          className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                            currentStatus === "UNAVAILABLE"
                              ? "bg-red-600 text-white border-red-600"
                              : "bg-white text-gray-600 border-gray-200 hover:bg-red-50 hover:border-red-300"
                          }`}
                        >
                          Out
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedPlayerId && activeRounds.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No rounds scheduled yet.</p>
          )}

          {data.players.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No players on this team yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
