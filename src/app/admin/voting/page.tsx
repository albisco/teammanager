"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import QRCode from "qrcode";
import Image from "next/image";

interface VotingSession {
  id: string;
  status: "OPEN" | "CLOSED";
  qrToken: string;
  _count: { votes: number };
}

interface RoundWithVoting {
  id: string;
  roundNumber: number;
  date: string | null;
  isBye: boolean;
  opponent: string | null;
  votingSession: VotingSession | null;
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

interface LeaderboardEntry {
  player: { id: string; firstName: string; surname: string; jumperNumber: number };
  totalPoints: number;
  byRound: Record<string, number>;
}

interface AuditEntry {
  id: string;
  voterName: string;
  voterType: "PARENT" | "COACH" | "PLAYER";
  roundNumber: number;
  rankings: { playerId: string; points: number }[];
  submittedAt: string;
}

export default function VotingPage() {
  const { data: session } = useSession();
  const sessionUser = session?.user as (Record<string, unknown> | undefined);
  const clubId = sessionUser?.clubId as string | undefined;

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [rounds, setRounds] = useState<RoundWithVoting[]>([]);
  const [maxVotesPerRound, setMaxVotesPerRound] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Max votes edit dialog
  const [maxDialogOpen, setMaxDialogOpen] = useState(false);
  const [maxDialogValue, setMaxDialogValue] = useState(4);
  const [savingMax, setSavingMax] = useState(false);

  // QR dialog
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrRoundLabel, setQrRoundLabel] = useState("");
  const [qrLink, setQrLink] = useState("");

  // Results dialog
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsTitle, setResultsTitle] = useState("");
  const [resultsTab, setResultsTab] = useState<"leaderboard" | "audit">("leaderboard");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [voteCount, setVoteCount] = useState(0);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [playerMap, setPlayerMap] = useState<Record<string, string>>({});

  const fetchSeasons = useCallback(async () => {
    const res = await fetch("/api/season");
    if (res.ok) setSeasons(await res.json());
  }, []);

  useEffect(() => { fetchSeasons(); }, [fetchSeasons]);

  const fetchRounds = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/voting?teamId=${teamId}`);
    if (res.ok) {
      const data = await res.json();
      setRounds(data.rounds ?? []);
      setMaxVotesPerRound(data.maxVotesPerRound ?? null);
    }
  }, []);

  useEffect(() => {
    if (selectedTeam) fetchRounds(selectedTeam.id);
  }, [selectedTeam, fetchRounds]);

  async function openVoting(roundId: string) {
    setLoading(true);
    const res = await fetch("/api/voting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId }),
    });
    if (res.ok) {
      toast.success("Voting opened");
      if (selectedTeam) fetchRounds(selectedTeam.id);
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to open voting");
    }
    setLoading(false);
  }

  async function toggleVoting(sessionId: string, currentStatus: string) {
    const newStatus = currentStatus === "OPEN" ? "CLOSED" : "OPEN";
    const res = await fetch("/api/voting", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ votingSessionId: sessionId, status: newStatus }),
    });
    if (res.ok) {
      toast.success(`Voting ${newStatus.toLowerCase()}`);
      if (selectedTeam) fetchRounds(selectedTeam.id);
    }
  }

  async function saveMaxVotes() {
    if (!clubId) return;
    const parsed = Number(maxDialogValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast.error("Max votes must be a positive whole number");
      return;
    }
    setSavingMax(true);
    const res = await fetch("/api/clubs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: clubId, maxVotesPerRound: parsed }),
    });
    if (res.ok) {
      toast.success("Max votes updated");
      setMaxVotesPerRound(parsed);
      setMaxDialogOpen(false);
      if (selectedTeam) fetchRounds(selectedTeam.id);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to update");
    }
    setSavingMax(false);
  }

  async function deleteVote(voteId: string) {
    if (!confirm("Delete this vote? Voting will remain in its current status — reopen manually if needed.")) return;
    const res = await fetch(`/api/voting/votes/${voteId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Vote deleted");
      setAudit((prev) => prev.filter((a) => a.id !== voteId));
      setVoteCount((c) => Math.max(0, c - 1));
      if (selectedTeam) fetchRounds(selectedTeam.id);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to delete vote");
    }
  }

  async function showQR(token: string, roundLabel: string) {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/vote/${token}`;
    setQrLink(link);
    setQrRoundLabel(roundLabel);
    const dataUrl = await QRCode.toDataURL(link, { width: 300, margin: 2 });
    setQrDataUrl(dataUrl);
    setQrDialogOpen(true);
  }

  async function showResults(teamId: string, roundId?: string, title?: string) {
    const url = roundId
      ? `/api/voting/results?teamId=${teamId}&roundId=${roundId}`
      : `/api/voting/results?teamId=${teamId}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setLeaderboard(data.leaderboard);
      setVoteCount(data.voteCount);
      setAudit(data.audit || []);
      setPlayerMap(data.playerMap || {});
      setResultsTitle(title || "Season Leaderboard");
      setResultsTab("leaderboard");
      setResultsOpen(true);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Voting</h1>
        {maxVotesPerRound !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Max votes per round:</span>
            <Badge variant="secondary">{maxVotesPerRound}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setMaxDialogValue(maxVotesPerRound); setMaxDialogOpen(true); }}
            >
              Edit
            </Button>
          </div>
        )}
      </div>

      {/* Team selector */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {seasons.map((season) =>
          season.teams.map((team) => (
            <Card
              key={team.id}
              className={`cursor-pointer transition-colors ${selectedTeam?.id === team.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedTeam(team)}
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
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {selectedTeam.ageGroup} {selectedTeam.name} — Rounds
            </h2>
            <Button variant="outline" onClick={() => showResults(selectedTeam.id)}>
              Season Leaderboard
            </Button>
          </div>

          <div className="bg-card rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Round</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-20">Votes</TableHead>
                  <TableHead className="w-64">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.filter((r) => !r.isBye).map((round) => (
                  <TableRow key={round.id}>
                    <TableCell className="font-mono">{round.roundNumber}</TableCell>
                    <TableCell>{round.opponent || "—"}</TableCell>
                    <TableCell>
                      {round.date
                        ? new Date(round.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {!round.votingSession ? (
                        <Badge variant="outline">No voting</Badge>
                      ) : round.votingSession.status === "OPEN" ? (
                        <Badge className="bg-green-600">Open</Badge>
                      ) : maxVotesPerRound !== null && round.votingSession._count.votes >= maxVotesPerRound ? (
                        <Badge className="bg-amber-600">Full</Badge>
                      ) : (
                        <Badge variant="secondary">Closed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {round.votingSession
                        ? `${round.votingSession._count.votes}${maxVotesPerRound !== null ? ` / ${maxVotesPerRound}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {!round.votingSession ? (
                          <Button size="sm" onClick={() => openVoting(round.id)} disabled={loading}>
                            Open Voting
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant={round.votingSession.status === "OPEN" ? "destructive" : "default"}
                              onClick={() => toggleVoting(round.votingSession!.id, round.votingSession!.status)}
                            >
                              {round.votingSession.status === "OPEN" ? "Close" : "Reopen"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => showQR(round.votingSession!.qrToken, `Round ${round.roundNumber}`)}
                            >
                              QR Code
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => showResults(selectedTeam.id, round.id, `Round ${round.roundNumber} Results`)}
                            >
                              Results
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Max Votes Dialog */}
      <Dialog open={maxDialogOpen} onOpenChange={setMaxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Max Votes Per Round</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Max Votes Per Round</Label>
            <Input
              type="number"
              min={1}
              value={maxDialogValue}
              onChange={(e) => setMaxDialogValue(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="text-xs text-gray-500">
              When a round hits this many votes, voting auto-closes. Deleting a vote does not automatically reopen — use the round&apos;s Reopen button.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaxDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveMaxVotes} disabled={savingMax}>
              {savingMax ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code — {qrRoundLabel}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrDataUrl && (
              <Image src={qrDataUrl} alt="Voting QR Code" width={300} height={300} />
            )}
            <p className="text-sm text-gray-500 break-all text-center">{qrLink}</p>
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(qrLink); toast.success("Link copied"); }}
            >
              Copy Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{resultsTitle}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-500 mb-4">{voteCount} vote{voteCount !== 1 ? "s" : ""} submitted</p>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b">
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${resultsTab === "leaderboard" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setResultsTab("leaderboard")}
              >
                Leaderboard
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${resultsTab === "audit" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setResultsTab("audit")}
              >
                Vote Audit ({audit.length})
              </button>
            </div>

            {resultsTab === "leaderboard" && (
              <div className="bg-card rounded-lg border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="w-20 text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                          No votes yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      leaderboard.map((entry, i) => (
                        <TableRow key={entry.player.id}>
                          <TableCell className="font-mono">{i + 1}</TableCell>
                          <TableCell className="font-mono">{entry.player.jumperNumber}</TableCell>
                          <TableCell className="font-medium">
                            {entry.player.firstName} {entry.player.surname}
                          </TableCell>
                          <TableCell className="text-right font-bold">{entry.totalPoints}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {resultsTab === "audit" && (
              <div className="bg-card rounded-lg border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voter</TableHead>
                      <TableHead className="w-20">Type</TableHead>
                      <TableHead className="w-16">Rnd</TableHead>
                      <TableHead>Rankings</TableHead>
                      <TableHead className="w-36">Submitted</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                          No votes to audit.
                        </TableCell>
                      </TableRow>
                    ) : (
                      audit
                        .slice()
                        .sort((a, b) => a.roundNumber - b.roundNumber || a.voterName.localeCompare(b.voterName))
                        .map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.voterName}</TableCell>
                            <TableCell>
                              <Badge variant={entry.voterType === "COACH" ? "default" : "secondary"}>
                                {entry.voterType}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono">{entry.roundNumber}</TableCell>
                            <TableCell className="text-sm">
                              {entry.rankings.map((r, j) => (
                                <span key={j}>
                                  {j > 0 && ", "}
                                  <span className="text-gray-500">{r.points}pts</span>{" "}
                                  {playerMap[r.playerId] || "Unknown"}
                                </span>
                              ))}
                            </TableCell>
                            <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                              {new Date(entry.submittedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="destructive" onClick={() => deleteVote(entry.id)}>
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
