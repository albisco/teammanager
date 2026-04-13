"use client";

import { useState, useEffect } from "react";
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
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [form, setForm] = useState({ date: "", gameTime: "", opponent: "", venue: "" });

  useEffect(() => {
    fetch("/api/manager/team")
      .then((r) => r.json())
      .then((data) => {
        setRounds(data.rounds || []);
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

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Fixture</h1>

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
                      ? new Date(round.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) + (round.gameTime ? ` ${round.gameTime}` : "")
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {round.date
                      ? new Date(round.date).toLocaleTimeString("en-AU", {
                          hour: "numeric", minute: "2-digit", hour12: true,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>{round.opponent || "—"}</TableCell>
                  <TableCell>{round.venue || "—"}</TableCell>
                  <TableCell>
                    {round.isBye
                      ? <Badge variant="secondary">BYE</Badge>
                      : <Badge variant="outline">Active</Badge>}
                  </TableCell>
                  <TableCell>
                    {!round.isBye && (
                      <Button variant="outline" size="sm" onClick={() => openEdit(round)}>
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-gray-400 mt-2">Contact your club admin to add or remove rounds.</p>

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
              <Label>Time</Label>
              <Input
                type="time"
                value={form.gameTime}
                onChange={(e) => setForm({ ...form, gameTime: e.target.value })}
              />
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
