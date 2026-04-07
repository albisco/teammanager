"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
  voterName: string;
  voterType: "PARENT" | "COACH";
  roundNumber: number;
  rankings: { playerId: string; points: number }[];
  submittedAt: string;
}

export default function VotingPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [rounds, setRounds] = useState<RoundWithVoting[]>([]);
  const [loading, setLoading] = useState(false);

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
    if (res.ok) setRounds(await res.json());
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
      <h1 className="text-3xl font-bold mb-6">Voting</h1>

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
                      ) : (
                        <Badge variant="secondary">Closed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {round.votingSession?._count.votes ?? "—"}
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                          No votes to audit.
                        </TableCell>
                      </TableRow>
                    ) : (
                      audit
                        .sort((a, b) => a.roundNumber - b.roundNumber || a.voterName.localeCompare(b.voterName))
                        .map((entry, i) => (
                          <TableRow key={i}>
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
