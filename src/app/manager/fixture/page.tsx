"use client";

import { useState, useEffect } from "react";
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

interface Round {
  id: string;
  roundNumber: number;
  date: string | null;
  gameTime: string | null;
  isBye: boolean;
  opponent: string | null;
  venue: string | null;
}

export default function ManagerFixturePage() {
  const { data: session } = useSession();
  const teamId = (session?.user as Record<string, unknown> | undefined)?.teamId as string | null;
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState({ date: "", gameTime: "", opponent: "", venue: "" });
  const [addForm, setAddForm] = useState({ roundNumber: "", date: "", gameTime: "", opponent: "", venue: "", isBye: false });

  useEffect(() => {
    fetch("/api/manager/team")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setRounds(data?.rounds || []);
        setLoading(false);
      });
  }, []);

  function openEdit(round: Round) {
    setEditingRound(round);
    setForm({
      date: round.date ? round.date.split("T")[0] : "",
      gameTime: round.gameTime || "",
      opponent: round.opponent || "",
      venue: round.venue || "",
    });
  }

  async function handleSave() {
    if (!editingRound) return;
    setSaving(true);
    const res = await fetch(`/api/rounds/${editingRound.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date || null,
        gameTime: form.gameTime || null,
        opponent: form.opponent || null,
        venue: form.venue || null,
      }),
    });
    if (res.ok) {
      toast.success("Round updated");
      setEditingRound(null);
      const updated: Round = await res.json();
      setRounds((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } else {
      toast.error("Failed to update");
    }
    setSaving(false);
  }

  function openAdd() {
    const next = rounds.length ? Math.max(...rounds.map((r) => r.roundNumber)) + 1 : 1;
    setAddForm({ roundNumber: String(next), date: "", gameTime: "", opponent: "", venue: "", isBye: false });
    setAddDialogOpen(true);
  }

  async function handleAdd() {
    if (!teamId) { toast.error("No team"); return; }
    if (!addForm.roundNumber) { toast.error("Round number required"); return; }
    setSaving(true);
    const res = await fetch("/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        roundNumber: parseInt(addForm.roundNumber),
        date: addForm.date || null,
        gameTime: addForm.gameTime || null,
        opponent: addForm.opponent || null,
        venue: addForm.venue || null,
        isBye: addForm.isBye,
      }),
    });
    if (res.ok) {
      const created: Round = await res.json();
      setRounds((prev) => [...prev, created].sort((a, b) => a.roundNumber - b.roundNumber));
      setAddDialogOpen(false);
      toast.success("Round added");
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Failed to add");
    }
    setSaving(false);
  }

  async function handleDelete(round: Round) {
    if (!confirm(`Delete round ${round.roundNumber}?`)) return;
    const res = await fetch(`/api/rounds/${round.id}`, { method: "DELETE" });
    if (res.ok) {
      setRounds((prev) => prev.filter((r) => r.id !== round.id));
      toast.success("Round deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Fixture</h1>
        <Button onClick={openAdd}>Add Round</Button>
      </div>

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Round</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Opponent</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rounds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                  No rounds scheduled yet.
                </TableCell>
              </TableRow>
            ) : (
              rounds.map((round) => (
                <TableRow key={round.id}>
                  <TableCell className="font-mono">{round.roundNumber}</TableCell>
                  <TableCell>
                    {round.date
                      ? new Date(round.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {round.gameTime || "—"}
                  </TableCell>
                  <TableCell>{round.opponent || "—"}</TableCell>
                  <TableCell>{round.venue || "—"}</TableCell>
                  <TableCell>
                    {round.isBye
                      ? <Badge variant="secondary">BYE</Badge>
                      : <Badge variant="outline">Active</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {!round.isBye && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(round)}>
                          Edit
                        </Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(round)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Round</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Round Number *</Label>
                <Input type="number" value={addForm.roundNumber} onChange={(e) => setAddForm({ ...addForm, roundNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Game Time</Label>
              <Input type="time" value={addForm.gameTime} onChange={(e) => setAddForm({ ...addForm, gameTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Opponent</Label>
              <Input value={addForm.opponent} onChange={(e) => setAddForm({ ...addForm, opponent: e.target.value })} placeholder="e.g. Smithfield Roos" />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input value={addForm.venue} onChange={(e) => setAddForm({ ...addForm, venue: e.target.value })} placeholder="e.g. Central Oval" />
            </div>
            <div className="flex items-center gap-2">
              <input id="isBye" type="checkbox" checked={addForm.isBye} onChange={(e) => setAddForm({ ...addForm, isBye: e.target.checked })} />
              <Label htmlFor="isBye" className="cursor-pointer">Bye round</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRound} onOpenChange={(open) => { if (!open) setEditingRound(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Round {editingRound?.roundNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Game Time</Label>
                <Input
                  type="time"
                  value={form.gameTime}
                  onChange={(e) => setForm({ ...form, gameTime: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Opponent</Label>
              <Input
                value={form.opponent}
                onChange={(e) => setForm({ ...form, opponent: e.target.value })}
                placeholder="e.g. Smithfield Roos"
              />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                placeholder="e.g. Central Oval"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRound(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
