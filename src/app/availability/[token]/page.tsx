"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface Family {
  id: string;
  name: string;
}

interface Round {
  id: string;
  roundNumber: number;
  date: string | null;
  gameTime: string | null;
  isBye: boolean;
}

interface TeamData {
  teamName: string;
  ageGroup: string;
  families: Family[];
  rounds: Round[];
  unavailabilities: { familyId: string; roundId: string }[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function FamilyAvailabilityPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [unavailableRoundIds, setUnavailableRoundIds] = useState<Set<string>>(new Set());
  const [savingRoundId, setSavingRoundId] = useState<string | null>(null);
  const [savedRoundId, setSavedRoundId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/family/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((d: TeamData) => setData(d))
      .catch(() => setError("Team not found. Check your link and try again."));
  }, [token]);

  // When family selection changes, update unavailability set
  useEffect(() => {
    if (!data || !selectedFamilyId) {
      setUnavailableRoundIds(new Set());
      return;
    }
    const unavailRounds = new Set(
      data.unavailabilities
        .filter((u) => u.familyId === selectedFamilyId)
        .map((u) => u.roundId)
    );
    setUnavailableRoundIds(unavailRounds);
  }, [data, selectedFamilyId]);

  const toggleUnavailability = useCallback(
    async (roundId: string, currentlyUnavailable: boolean) => {
      if (!selectedFamilyId) return;

      setSavingRoundId(roundId);
      setSavedRoundId(null);

      const newUnavailable = !currentlyUnavailable;

      // Optimistic update
      setUnavailableRoundIds((prev) => {
        const next = new Set(prev);
        if (newUnavailable) {
          next.add(roundId);
        } else {
          next.delete(roundId);
        }
        return next;
      });

      try {
        const res = await fetch(`/api/family/${token}/unavailability`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId: selectedFamilyId, roundId, unavailable: newUnavailable }),
        });

        if (!res.ok) {
          // Revert on failure
          setUnavailableRoundIds((prev) => {
            const next = new Set(prev);
            if (newUnavailable) {
              next.delete(roundId);
            } else {
              next.add(roundId);
            }
            return next;
          });
        } else {
          setSavedRoundId(roundId);
          setTimeout(() => setSavedRoundId(null), 2000);
        }
      } catch {
        // Revert on error
        setUnavailableRoundIds((prev) => {
          const next = new Set(prev);
          if (newUnavailable) {
            next.delete(roundId);
          } else {
            next.add(roundId);
          }
          return next;
        });
      } finally {
        setSavingRoundId(null);
      }
    },
    [selectedFamilyId, token]
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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary">{data.ageGroup}</Badge>
          </div>
          <CardTitle>{data.teamName}</CardTitle>
          <CardDescription>Let us know which rounds your family can&apos;t make it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Family selector */}
          <div className="space-y-2">
            <Label htmlFor="family-select">Which family are you?</Label>
            <select
              id="family-select"
              value={selectedFamilyId}
              onChange={(e) => setSelectedFamilyId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select your family...</option>
              {data.families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Round schedule */}
          {selectedFamilyId && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 font-medium">
                Toggle any rounds your family can&apos;t attend. Changes save automatically.
              </p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
                {activeRounds.map((round) => {
                  const isUnavailable = unavailableRoundIds.has(round.id);
                  const isSaving = savingRoundId === round.id;
                  const justSaved = savedRoundId === round.id;

                  return (
                    <button
                      key={round.id}
                      onClick={() => toggleUnavailability(round.id, isUnavailable)}
                      disabled={isSaving}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                        isUnavailable
                          ? "bg-red-50 hover:bg-red-100"
                          : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">R{round.roundNumber}</span>
                          {round.date && (
                            <span className="text-xs text-gray-500">{formatDate(round.date)}</span>
                          )}
                          {round.gameTime && (
                            <span className="text-xs text-gray-500">{round.gameTime}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        {isSaving && (
                          <span className="text-xs text-gray-400">Saving...</span>
                        )}
                        {justSaved && !isSaving && (
                          <span className="text-xs text-green-600">Saved ✓</span>
                        )}
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${
                            isUnavailable
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {isUnavailable ? "Can't make it" : "Available"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedFamilyId && activeRounds.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No rounds scheduled yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
