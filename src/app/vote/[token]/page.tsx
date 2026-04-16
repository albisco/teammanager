"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Player {
  id: string;
  firstName: string;
  surname: string;
  jumperNumber: number;
}

interface VotingData {
  id: string;
  status: "OPEN" | "CLOSED";
  isAdultClub: boolean;
  round: { roundNumber: number; opponent: string | null; date: string | null };
  team: { name: string; ageGroup: string; seasonName: string; votingScheme: number[] };
  players: Player[];
}

export default function VotePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<VotingData | null>(null);
  const [error, setError] = useState("");
  const [voterName, setVoterName] = useState("");
  const [voterType, setVoterType] = useState<"PARENT" | "COACH" | "PLAYER">("PARENT");
  const [selfPlayerId, setSelfPlayerId] = useState("");
  const [rankings, setRankings] = useState<(string | null)[]>([]);
  const [step, setStep] = useState<"name" | "vote" | "done">("name");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    fetch(`/api/voting/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((d: VotingData) => {
        setData(d);
        setRankings(new Array(d.team.votingScheme.length).fill(null));
      })
      .catch(() => setError("Voting session not found"));
  }, [token]);

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
        <p>Loading...</p>
      </div>
    );
  }

  if (data.status !== "OPEN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600">Voting is closed for this round.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function setRanking(position: number, playerId: string) {
    setRankings((prev) => {
      const next = [...prev];
      // If this player was already selected in another position, clear it
      const existingIdx = next.indexOf(playerId);
      if (existingIdx !== -1) next[existingIdx] = null;
      next[position] = playerId;
      return next;
    });
  }

  function getAvailablePlayers(position: number) {
    return data!.players.filter(
      (p) =>
        p.id !== selfPlayerId &&
        (!rankings.includes(p.id) || rankings[position] === p.id)
    );
  }

  async function handleSubmit() {
    if (!voterName.trim()) return;
    if (rankings.some((r) => !r)) {
      setSubmitError("Please select a player for each position");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const res = await fetch(`/api/voting/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voterName: voterName.trim(),
        voterType,
        rankings: rankings.map((playerId) => ({ playerId })),
      }),
    });

    if (res.ok) {
      setStep("done");
    } else {
      const d = await res.json();
      setSubmitError(d.error || "Failed to submit vote");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary">{data.team.ageGroup}</Badge>
            <span className="text-sm text-gray-500">{data.team.seasonName}</span>
          </div>
          <CardTitle>{data.team.name} — Round {data.round.roundNumber}</CardTitle>
          {data.round.opponent && (
            <CardDescription>vs {data.round.opponent}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {step === "name" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>I am a...</Label>
                <div className="flex gap-2">
                  <Button
                    variant={voterType === "PARENT" ? "default" : "outline"}
                    onClick={() => { setVoterType("PARENT"); setSelfPlayerId(""); setVoterName(""); }}
                    className="flex-1"
                  >
                    Parent
                  </Button>
                  <Button
                    variant={voterType === "COACH" ? "default" : "outline"}
                    onClick={() => { setVoterType("COACH"); setSelfPlayerId(""); setVoterName(""); }}
                    className="flex-1"
                  >
                    Coach
                  </Button>
                  {data.isAdultClub && (
                    <Button
                      variant={voterType === "PLAYER" ? "default" : "outline"}
                      onClick={() => { setVoterType("PLAYER"); setVoterName(""); }}
                      className="flex-1"
                    >
                      Player
                    </Button>
                  )}
                </div>
              </div>

              {voterType === "PLAYER" ? (
                <div className="space-y-2">
                  <Label>Who are you?</Label>
                  <select
                    value={selfPlayerId}
                    onChange={(e) => {
                      const player = data.players.find((p) => p.id === e.target.value);
                      setSelfPlayerId(e.target.value);
                      setVoterName(player ? `${player.firstName} ${player.surname}` : "");
                    }}
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
              ) : (
                <div className="space-y-2">
                  <Label>Your Name</Label>
                  <Input
                    value={voterName}
                    onChange={(e) => setVoterName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => setStep("vote")}
                disabled={!voterName.trim() || (voterType === "PLAYER" && !selfPlayerId)}
              >
                Start Voting
              </Button>
            </div>
          )}

          {step === "vote" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select a player for each position. Points: {data.team.votingScheme.join(", ")}
              </p>

              {data.team.votingScheme.map((points, i) => (
                <div key={i} className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Badge>{points} pts</Badge>
                    Position {i + 1}
                  </Label>
                  <div className="grid grid-cols-2 gap-1">
                    {getAvailablePlayers(i).map((player) => (
                      <button
                        key={player.id}
                        className={`text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                          rankings[i] === player.id
                            ? "bg-black text-white border-black"
                            : "bg-white text-black border-gray-200 hover:bg-gray-100"
                        }`}
                        onClick={() => setRanking(i, player.id)}
                      >
                        <span className="font-mono text-xs mr-1">#{player.jumperNumber}</span>
                        {player.firstName} {player.surname}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {submitError && <p className="text-sm text-red-600">{submitError}</p>}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("name")} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                  {submitting ? "Submitting..." : "Submit Vote"}
                </Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8">
              <p className="text-2xl font-bold text-green-600 mb-2">Vote Submitted!</p>
              <p className="text-gray-600">Thanks {voterName}, your vote has been recorded.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
