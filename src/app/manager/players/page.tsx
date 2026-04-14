"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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

export default function ManagerPlayersPage() {
  const { data: session } = useSession();
  const teamId = (session?.user as Record<string, unknown>)?.teamId as string | null;

  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchPlayers = useCallback(() => {
    fetch("/api/manager/team")
      .then((r) => r.json())
      .then((data) => {
        const sorted = (data.players || [])
          .map((tp: { player: Player }) => tp.player)
          .sort((a: Player, b: Player) => a.jumperNumber - b.jumperNumber);
        setPlayers(sorted);
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

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
    setSaving(true);
    if (editingId) {
      const res = await fetch(`/api/players/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("Player updated");
        setDialogOpen(false);
        fetchPlayers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update");
      }
    } else {
      // Create player then assign to this team
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const player = await res.json();
        if (teamId) {
          await fetch(`/api/teams/${teamId}/players`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: player.id }),
          });
        }
        toast.success("Player added");
        setDialogOpen(false);
        fetchPlayers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add player");
      }
    }
    setSaving(false);
  }

  const filtered = players.filter(
    (p) =>
      p.firstName.toLowerCase().includes(search.toLowerCase()) ||
      p.surname.toLowerCase().includes(search.toLowerCase()) ||
      String(p.jumperNumber).includes(search)
  );

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Players</h1>
        <Button onClick={openAdd}>Add Player</Button>
      </div>

      <Input
        placeholder="Search by name or jumper..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

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
              <TableHead>Family</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                  {players.length === 0 ? "No players in this team." : "No matches found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.jumperNumber}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{p.firstName} {p.surname}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {p.dateOfBirth
                      ? new Date(p.dateOfBirth).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{p.contactEmail || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{p.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{p.parent1 || "—"}</TableCell>
                  <TableCell className="text-sm">{p.parent2 || "—"}</TableCell>
                  <TableCell>
                    {p.family ? (
                      <Badge variant="secondary" className="text-xs">{p.family.name}</Badge>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
