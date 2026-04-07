"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface TeamInfo {
  id: string;
  name: string;
  ageGroup: string;
}

interface Player {
  id: string;
  jumperNumber: number;
  firstName: string;
  surname: string;
  dateOfBirth: string | null;
  phone: string | null;
  contactEmail: string | null;
  parent1: string | null;
  parent2: string | null;
  spare1: string | null;
  spare2: string | null;
  familyId: string | null;
  family: { id: string; name: string } | null;
  club: { id: string; name: string } | null;
  teamPlayers: { team: TeamInfo }[];
}

const emptyForm = {
  jumperNumber: "",
  firstName: "",
  surname: "",
  dateOfBirth: "",
  phone: "",
  contactEmail: "",
  parent1: "",
  parent2: "",
  spare1: "",
  spare2: "",
};

export default function PlayersPage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as Record<string, unknown>)?.role === "SUPER_ADMIN";
  const [players, setPlayers] = useState<Player[]>([]);
  const [allTeams, setAllTeams] = useState<(TeamInfo & { seasonName: string })[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  // Team assignment dialog
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [teamDialogPlayer, setTeamDialogPlayer] = useState<Player | null>(null);

  const fetchPlayers = useCallback(async () => {
    const res = await fetch("/api/players");
    if (res.ok) setPlayers(await res.json());
  }, []);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/season");
    if (res.ok) {
      const seasons = await res.json();
      const teams: (TeamInfo & { seasonName: string })[] = [];
      for (const season of seasons) {
        for (const team of season.teams) {
          teams.push({ id: team.id, name: team.name, ageGroup: team.ageGroup, seasonName: season.name });
        }
      }
      setAllTeams(teams);
    }
  }, []);

  useEffect(() => { fetchPlayers(); fetchTeams(); }, [fetchPlayers, fetchTeams]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(player: Player) {
    setEditingId(player.id);
    setForm({
      jumperNumber: String(player.jumperNumber),
      firstName: player.firstName,
      surname: player.surname,
      dateOfBirth: player.dateOfBirth ? player.dateOfBirth.split("T")[0] : "",
      phone: player.phone || "",
      contactEmail: player.contactEmail || "",
      parent1: player.parent1 || "",
      parent2: player.parent2 || "",
      spare1: player.spare1 || "",
      spare2: player.spare2 || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setLoading(true);
    const url = editingId ? `/api/players/${editingId}` : "/api/players";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editingId ? "Player updated" : "Player added");
      setDialogOpen(false);
      fetchPlayers();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this player?")) return;
    const res = await fetch(`/api/players/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Player deleted");
      fetchPlayers();
    } else {
      toast.error("Failed to delete");
    }
  }

  function openTeamDialog(player: Player) {
    setTeamDialogPlayer(player);
    setTeamDialogOpen(true);
  }

  async function toggleTeam(teamId: string) {
    if (!teamDialogPlayer) return;
    const isAssigned = teamDialogPlayer.teamPlayers.some((tp) => tp.team.id === teamId);
    const res = await fetch(`/api/teams/${teamId}/players`, {
      method: isAssigned ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: teamDialogPlayer.id }),
    });
    if (res.ok) {
      toast.success(isAssigned ? "Removed from team" : "Added to team");
      await fetchPlayers();
      // Refresh dialog player
      const updated = (await (await fetch("/api/players")).json()) as Player[];
      setTeamDialogPlayer(updated.find((p) => p.id === teamDialogPlayer.id) || null);
    } else {
      toast.error("Failed to update team");
    }
  }

  const filtered = players.filter(
    (p) =>
      p.firstName.toLowerCase().includes(search.toLowerCase()) ||
      p.surname.toLowerCase().includes(search.toLowerCase()) ||
      String(p.jumperNumber).includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Players</h1>
{!isSuperAdmin && <Button onClick={openAdd}>Add Player</Button>}
      </div>

      <Input
        placeholder="Search by name or jumper number..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Name</TableHead>
              {isSuperAdmin && <TableHead>Club</TableHead>}
              <TableHead>Teams</TableHead>
              <TableHead>Contact Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Parent 1</TableHead>
              {!isSuperAdmin && <TableHead className="w-40">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 8 : 7} className="text-center text-gray-500 py-8">
                  {players.length === 0 ? "No players yet. Add your first player!" : "No matches found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((player) => (
                <TableRow key={player.id}>
                  <TableCell className="font-mono">{player.jumperNumber}</TableCell>
                  <TableCell className="font-medium">{player.firstName} {player.surname}</TableCell>
                  {isSuperAdmin && (
                    <TableCell>
                      <Badge variant="outline">{player.club?.name || "—"}</Badge>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {player.teamPlayers.length > 0
                        ? player.teamPlayers.map((tp) => (
                            <Badge key={tp.team.id} variant="secondary">
                              {tp.team.ageGroup} {tp.team.name}
                            </Badge>
                          ))
                        : <span className="text-gray-400 text-sm">Unassigned</span>}
                    </div>
                  </TableCell>
                  <TableCell>{player.contactEmail || "—"}</TableCell>
                  <TableCell>{player.phone || "—"}</TableCell>
                  <TableCell>{player.parent1 || "—"}</TableCell>
                  {!isSuperAdmin && (
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openTeamDialog(player)}>Teams</Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(player)}>Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(player.id)}>Delete</Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Player Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Player" : "Add Player"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Jumper Number *</Label>
              <Input type="number" value={form.jumperNumber} onChange={(e) => setForm({ ...form, jumperNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Surname *</Label>
              <Input value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Parent 1</Label>
              <Input value={form.parent1} onChange={(e) => setForm({ ...form, parent1: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Parent 2</Label>
              <Input value={form.parent2} onChange={(e) => setForm({ ...form, parent2: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Emergency Contact 1</Label>
              <Input value={form.spare1} onChange={(e) => setForm({ ...form, spare1: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Emergency Contact 2</Label>
              <Input value={form.spare2} onChange={(e) => setForm({ ...form, spare2: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Assignment Dialog */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Teams — {teamDialogPlayer?.firstName} {teamDialogPlayer?.surname}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {allTeams.length === 0 ? (
              <p className="text-gray-500">No teams available. Create a season and team first.</p>
            ) : (
              allTeams.map((team) => {
                const isAssigned = teamDialogPlayer?.teamPlayers.some((tp) => tp.team.id === team.id) ?? false;
                return (
                  <div key={team.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <span className="font-medium">{team.ageGroup} {team.name}</span>
                      <span className="text-sm text-gray-400 ml-2">({team.seasonName})</span>
                    </div>
                    <Button
                      variant={isAssigned ? "destructive" : "default"}
                      size="sm"
                      onClick={() => toggleTeam(team.id)}
                    >
                      {isAssigned ? "Remove" : "Add"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
