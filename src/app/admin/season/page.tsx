"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TeamStaffPanel } from "@/components/team-staff-panel";

interface Round {
  id: string;
  roundNumber: number;
  date: string | null;
  gameTime: string | null;
  isBye: boolean;
  opponent: string | null;
  venue: string | null;
  court?: string | null;
}

interface FixturePreviewRow {
  externalId: string;
  roundNumber: number;
  date: string | null;
  gameTime: string | null;
  opponent: string | null;
  venue: string | null;
  court: string | null;
  isBye: boolean;
}

interface TeamPlayerInfo {
  player: {
    id: string;
    firstName: string;
    surname: string;
    jumperNumber: number;
    dateOfBirth: string | null;
    phone: string | null;
    contactEmail: string | null;
    parent1: string | null;
    parent2: string | null;
  };
}

interface TeamSummary {
  id: string;
  name: string;
  ageGroup: string;
  _count: { players: number; rounds: number };
}

interface TeamDetail extends TeamSummary {
  rounds: Round[];
  players: TeamPlayerInfo[];
}

interface Season {
  id: string;
  name: string;
  year: number;
  teams: TeamSummary[];
}

export default function SeasonPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [selectedTeamSummary, setSelectedTeamSummary] = useState<TeamSummary | null>(null);
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<TeamDetail | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamTab, setTeamTab] = useState<"rounds" | "players">("rounds");

  // Season dialog
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({ name: "", year: "" });

  // Team dialog
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({
    name: "",
    ageGroup: "",
  });
  // Round dialog
  const [roundDialogOpen, setRoundDialogOpen] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [roundForm, setRoundForm] = useState({
    roundNumber: "", date: "", gameTime: "", isBye: false, opponent: "", venue: "",
  });

  // Fixture import dialog
  const [fixtureDialogOpen, setFixtureDialogOpen] = useState(false);
  const [fixtureIcs, setFixtureIcs] = useState("");
  const [fixtureSourceUrl, setFixtureSourceUrl] = useState("");
  const [fixturePreview, setFixturePreview] = useState<FixturePreviewRow[] | null>(null);
  const [fixtureBusy, setFixtureBusy] = useState(false);

  const [loading, setLoading] = useState(false);

  const fetchSeasons = useCallback(async () => {
    const res = await fetch("/api/season");
    if (res.ok) {
      const data: Season[] = await res.json();
      setSeasons(data);
      if (selectedSeason) {
        const updated = data.find((s) => s.id === selectedSeason.id);
        if (updated) setSelectedSeason(updated);
      } else if (data.length > 0) {
        setSelectedSeason(data[0]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTeamDetail = useCallback(async (teamId: string) => {
    setTeamLoading(true);
    const res = await fetch(`/api/teams/${teamId}`);
    if (res.ok) {
      const data: TeamDetail = await res.json();
      setSelectedTeamDetail(data);
    }
    setTeamLoading(false);
  }, []);

  const selectTeam = useCallback((team: TeamSummary) => {
    setSelectedTeamSummary(team);
    setSelectedTeamDetail(null);
    fetchTeamDetail(team.id);
  }, [fetchTeamDetail]);

  const refreshTeamDetail = useCallback(async () => {
    if (selectedTeamSummary) {
      await fetchTeamDetail(selectedTeamSummary.id);
    }
    await fetchSeasons();
  }, [selectedTeamSummary, fetchTeamDetail, fetchSeasons]);

  useEffect(() => { fetchSeasons(); }, [fetchSeasons]);

  // === Season CRUD ===
  function openAddSeason() {
    setEditingSeasonId(null);
    setSeasonForm({ name: "", year: String(new Date().getFullYear()) });
    setSeasonDialogOpen(true);
  }
  function openEditSeason(season: Season) {
    setEditingSeasonId(season.id);
    setSeasonForm({ name: season.name, year: String(season.year) });
    setSeasonDialogOpen(true);
  }
  async function handleSaveSeason() {
    setLoading(true);
    const url = editingSeasonId ? `/api/season/${editingSeasonId}` : "/api/season";
    const method = editingSeasonId ? "PUT" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seasonForm),
    });
    if (res.ok) {
      toast.success(editingSeasonId ? "Season updated" : "Season created");
      setSeasonDialogOpen(false);
      fetchSeasons();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }
  async function handleDeleteSeason(id: string) {
    if (!confirm("Delete this season and all its teams/rounds?")) return;
    const res = await fetch(`/api/season/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Season deleted");
      if (selectedSeason?.id === id) { setSelectedSeason(null); setSelectedTeamSummary(null); setSelectedTeamDetail(null); }
      fetchSeasons();
    }
  }

  // === Team CRUD ===
  function openAddTeam() {
    setEditingTeamId(null);
    setTeamForm({ name: "", ageGroup: "" });
    setTeamDialogOpen(true);
  }
  function openEditTeam(team: TeamSummary) {
    setEditingTeamId(team.id);
    setTeamForm({ name: team.name, ageGroup: team.ageGroup });
    setTeamDialogOpen(true);
  }
  async function handleSaveTeam() {
    if (!selectedSeason) return;
    setLoading(true);
    const url = editingTeamId ? `/api/teams/${editingTeamId}` : "/api/teams";
    const method = editingTeamId ? "PUT" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: teamForm.name,
        ageGroup: teamForm.ageGroup,
        seasonId: selectedSeason.id,
      }),
    });
    if (res.ok) {
      toast.success(editingTeamId ? "Team updated" : "Team created");
      setTeamDialogOpen(false);
      refreshTeamDetail();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }
  async function handleDeleteTeam(id: string) {
    if (!confirm("Delete this team and all its rounds?")) return;
    const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Team deleted");
      if (selectedTeamSummary?.id === id) { setSelectedTeamSummary(null); setSelectedTeamDetail(null); }
      fetchSeasons();
    }
  }

  // === Fixture import ===
  function openFixtureImport() {
    setFixtureIcs("");
    setFixtureSourceUrl("");
    setFixturePreview(null);
    setFixtureDialogOpen(true);
  }

  async function handleFixturePreview() {
    if (!selectedTeamSummary) return;
    if (!fixtureIcs.trim()) {
      toast.error("Paste the iCal/.ics contents first");
      return;
    }
    setFixtureBusy(true);
    const res = await fetch(`/api/teams/${selectedTeamSummary.id}/fixture/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ics: fixtureIcs, sourceUrl: fixtureSourceUrl || undefined, dryRun: true }),
    });
    setFixtureBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Parse failed" }));
      toast.error(err.error || "Parse failed");
      return;
    }
    const data = await res.json();
    setFixturePreview(data.preview as FixturePreviewRow[]);
  }

  async function handleFixtureConfirm() {
    if (!selectedTeamSummary) return;
    setFixtureBusy(true);
    const res = await fetch(`/api/teams/${selectedTeamSummary.id}/fixture/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ics: fixtureIcs, sourceUrl: fixtureSourceUrl || undefined }),
    });
    setFixtureBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Import failed" }));
      toast.error(err.error || "Import failed");
      return;
    }
    const data = await res.json();
    toast.success(`Imported ${data.total} rounds (${data.created} new, ${data.updated} updated)`);
    setFixtureDialogOpen(false);
    refreshTeamDetail();
    fetchSeasons();
  }

  // === Round CRUD ===
  function openAddRound() {
    if (!selectedTeamDetail) return;
    const nextNum = selectedTeamDetail.rounds.length > 0
      ? Math.max(...selectedTeamDetail.rounds.map((r) => r.roundNumber)) + 1
      : 1;
    setEditingRoundId(null);
    setRoundForm({ roundNumber: String(nextNum), date: "", gameTime: "", isBye: false, opponent: "", venue: "" });
    setRoundDialogOpen(true);
  }
  function openEditRound(round: Round) {
    setEditingRoundId(round.id);
    setRoundForm({
      roundNumber: String(round.roundNumber),
      date: round.date ? round.date.split("T")[0] : "",
      gameTime: round.gameTime || "",
      isBye: round.isBye,
      opponent: round.opponent || "",
      venue: round.venue || "",
    });
    setRoundDialogOpen(true);
  }
  async function handleSaveRound() {
    if (!selectedTeamSummary) return;
    setLoading(true);
    const url = editingRoundId ? `/api/rounds/${editingRoundId}` : "/api/rounds";
    const method = editingRoundId ? "PUT" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...roundForm, teamId: selectedTeamSummary.id }),
    });
    if (res.ok) {
      toast.success(editingRoundId ? "Round updated" : "Round added");
      setRoundDialogOpen(false);
      refreshTeamDetail();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }
  async function handleDeleteRound(id: string) {
    if (!confirm("Delete this round?")) return;
    const res = await fetch(`/api/rounds/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Round deleted");
      refreshTeamDetail();
    }
  }

  return (
    <div>
      {/* === Seasons === */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold">Seasons</h1>
        <Button onClick={openAddSeason}>New Season</Button>
      </div>
      <div className="flex gap-3 mb-6 flex-wrap">
        {seasons.map((season) => (
          <Card
            key={season.id}
            className={`cursor-pointer transition-colors ${selectedSeason?.id === season.id ? "ring-2 ring-primary" : ""}`}
            onClick={() => { setSelectedSeason(season); setSelectedTeamSummary(null); setSelectedTeamDetail(null); }}
          >
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">{season.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-sm text-gray-500">{season.year} &middot; {season.teams.length} team{season.teams.length !== 1 ? "s" : ""}</p>
              <div className="flex gap-1 mt-2">
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openEditSeason(season); }}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteSeason(season.id); }}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {seasons.length === 0 && <p className="text-gray-500">No seasons yet. Create your first season!</p>}
      </div>

      {/* === Teams within selected season === */}
      {selectedSeason && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Teams — {selectedSeason.name}</h2>
            <Button onClick={openAddTeam}>Add Team</Button>
          </div>
          <div className="flex gap-3 mb-6 flex-wrap">
            {selectedSeason.teams.map((team) => (
              <Card
                key={team.id}
                className={`cursor-pointer transition-colors ${selectedTeamSummary?.id === team.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => selectTeam(team)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{team.ageGroup}</Badge>
                    <CardTitle className="text-base">{team.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-sm text-gray-500">
                    {team._count.players} player{team._count.players !== 1 ? "s" : ""} &middot; {team._count.rounds} round{team._count.rounds !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-1 mt-2">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openEditTeam(team); }}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id); }}>Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {selectedSeason.teams.length === 0 && <p className="text-gray-500">No teams yet. Add a team to this season!</p>}
          </div>
        </>
      )}

      {/* === Team detail: Rounds & Players tabs === */}
      {selectedTeamSummary && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">
                {selectedTeamSummary.ageGroup} {selectedTeamSummary.name}
              </h2>
            </div>
            <div className="flex gap-2">
              {teamTab === "rounds" && (
                <>
                  <Button variant="outline" onClick={openFixtureImport} disabled={!selectedTeamDetail}>Import Fixture</Button>
                  <Button onClick={openAddRound} disabled={!selectedTeamDetail}>Add Round</Button>
                </>
              )}
            </div>
          </div>

          <div className="mb-6">
            <TeamStaffPanel
              teamId={selectedTeamSummary.id}
              onChange={() => fetchSeasons()}
            />
          </div>

          {teamLoading && !selectedTeamDetail && (
            <p className="text-gray-500 py-8 text-center">Loading team details...</p>
          )}

          {selectedTeamDetail && (
            <>
              {/* Tabs */}
              <div className="flex gap-1 mb-4 border-b">
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${teamTab === "rounds" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                  onClick={() => setTeamTab("rounds")}
                >
                  Rounds ({selectedTeamDetail.rounds.length})
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${teamTab === "players" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                  onClick={() => setTeamTab("players")}
                >
                  Players ({selectedTeamDetail.players.length})
                </button>
              </div>

              {/* Rounds tab */}
              {teamTab === "rounds" && (
                <div className="bg-card rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Round</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Opponent</TableHead>
                        <TableHead>Venue</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTeamDetail.rounds.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                            No rounds yet. Add rounds to this team!
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedTeamDetail.rounds.map((round) => (
                          <TableRow key={round.id}>
                            <TableCell className="font-mono">{round.roundNumber}</TableCell>
                            <TableCell>
                              {round.date
                                ? new Date(round.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) + (round.gameTime ? ` ${round.gameTime}` : "")
                                : "—"}
                            </TableCell>
                            <TableCell>{round.opponent || "—"}</TableCell>
                            <TableCell>{round.venue || "—"}</TableCell>
                            <TableCell>
                              {round.isBye ? <Badge variant="secondary">BYE</Badge> : <Badge variant="outline">Active</Badge>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => openEditRound(round)}>Edit</Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteRound(round.id)}>Delete</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Players tab */}
              {teamTab === "players" && (
                <div className="bg-card rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>DOB</TableHead>
                        <TableHead>Contact Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Parent 1</TableHead>
                        <TableHead>Parent 2</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTeamDetail.players.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                            No players in this team. Assign players from the Players page.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedTeamDetail.players
                          .sort((a, b) => a.player.jumperNumber - b.player.jumperNumber)
                          .map((tp) => (
                            <TableRow key={tp.player.id}>
                              <TableCell className="font-mono">{tp.player.jumperNumber}</TableCell>
                              <TableCell className="font-medium whitespace-nowrap">{tp.player.firstName} {tp.player.surname}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {tp.player.dateOfBirth
                                  ? new Date(tp.player.dateOfBirth).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-sm">{tp.player.contactEmail || "—"}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{tp.player.phone || "—"}</TableCell>
                              <TableCell className="text-sm">{tp.player.parent1 || "—"}</TableCell>
                              <TableCell className="text-sm">{tp.player.parent2 || "—"}</TableCell>
                              <TableCell>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={async () => {
                                    if (!confirm(`Remove ${tp.player.firstName} ${tp.player.surname} from this team?`)) return;
                                    const res = await fetch(`/api/teams/${selectedTeamSummary!.id}/players`, {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ playerId: tp.player.id }),
                                    });
                                    if (res.ok) {
                                      toast.success("Player removed from team");
                                      refreshTeamDetail();
                                    }
                                  }}
                                >
                                  Remove
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* === Season Dialog === */}
      <Dialog open={seasonDialogOpen} onOpenChange={setSeasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSeasonId ? "Edit Season" : "New Season"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Season Name *</Label>
              <Input value={seasonForm.name} onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })} placeholder="e.g. 2026 Season" />
            </div>
            <div className="space-y-2">
              <Label>Year *</Label>
              <Input type="number" value={seasonForm.year} onChange={(e) => setSeasonForm({ ...seasonForm, year: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSeason} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Team Dialog === */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeamId ? "Edit Team" : "Add Team"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Age Group *</Label>
                <Input value={teamForm.ageGroup} onChange={(e) => setTeamForm({ ...teamForm, ageGroup: e.target.value })} placeholder="e.g. U7, U8, U12" />
              </div>
              <div className="space-y-2">
                <Label>Team Name *</Label>
                <Input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="e.g. Lightning" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTeam} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Round Dialog === */}
      <Dialog open={roundDialogOpen} onOpenChange={setRoundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoundId ? "Edit Round" : "Add Round"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Round Number *</Label>
                <Input type="number" value={roundForm.roundNumber} onChange={(e) => setRoundForm({ ...roundForm, roundNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={roundForm.date} onChange={(e) => setRoundForm({ ...roundForm, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Game Time</Label>
              <Input type="time" value={roundForm.gameTime} onChange={(e) => setRoundForm({ ...roundForm, gameTime: e.target.value })} placeholder="e.g. 09:30" />
            </div>
            <div className="space-y-2">
              <Label>Opponent</Label>
              <Input value={roundForm.opponent} onChange={(e) => setRoundForm({ ...roundForm, opponent: e.target.value })} placeholder="e.g. Smithfield Roos" />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input value={roundForm.venue} onChange={(e) => setRoundForm({ ...roundForm, venue: e.target.value })} placeholder="e.g. Central Oval" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isBye" checked={roundForm.isBye} onChange={(e) => setRoundForm({ ...roundForm, isBye: e.target.checked })} className="rounded border-gray-300" />
              <Label htmlFor="isBye">This is a bye round</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoundDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRound} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Fixture Import Dialog === */}
      <Dialog open={fixtureDialogOpen} onOpenChange={setFixtureDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Fixture from iCal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2 text-sm text-gray-600">
              <p>On your fixture page (e.g. Revolutionise), open the <b>iCal</b> export link and paste its raw contents below. Each event becomes or updates a round (matched by event UID, then round number).</p>
            </div>
            <div className="space-y-2">
              <Label>Source URL (optional)</Label>
              <Input
                value={fixtureSourceUrl}
                onChange={(e) => setFixtureSourceUrl(e.target.value)}
                placeholder="https://www.revolutionise.com.au/.../games/team/..."
              />
            </div>
            <div className="space-y-2">
              <Label>iCal / .ics contents *</Label>
              <Textarea
                value={fixtureIcs}
                onChange={(e) => setFixtureIcs(e.target.value)}
                placeholder="BEGIN:VCALENDAR..."
                rows={8}
                className="font-mono text-xs"
              />
            </div>
            {fixturePreview && (
              <div className="border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-sm font-medium border-b">
                  Preview ({fixturePreview.length} rounds)
                </div>
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Opponent</TableHead>
                        <TableHead>Venue</TableHead>
                        <TableHead>Court</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fixturePreview.map((r) => (
                        <TableRow key={r.externalId}>
                          <TableCell className="font-mono">{r.roundNumber}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {r.date
                              ? new Date(r.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) + (r.gameTime ? ` ${r.gameTime}` : "")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{r.opponent || "—"}</TableCell>
                          <TableCell className="text-xs">{r.venue || "—"}</TableCell>
                          <TableCell className="text-xs">{r.court || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFixtureDialogOpen(false)}>Cancel</Button>
            {!fixturePreview ? (
              <Button onClick={handleFixturePreview} disabled={fixtureBusy}>
                {fixtureBusy ? "Parsing..." : "Preview"}
              </Button>
            ) : (
              <Button onClick={handleFixtureConfirm} disabled={fixtureBusy}>
                {fixtureBusy ? "Importing..." : `Import ${fixturePreview.length} rounds`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
