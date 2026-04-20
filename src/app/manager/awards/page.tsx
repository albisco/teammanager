"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";

interface AwardType {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
}

interface RosterRound {
  id: string;
  roundNumber: number;
  isBye: boolean;
  date: string | null;
  opponent: string | null;
}

interface Player {
  id: string;
  name: string;
}

interface AwardSlot {
  slot: number;
  playerId: string;
  playerName: string;
  notes: string | null;
}

interface AwardsData {
  rounds: RosterRound[];
  awardTypes: AwardType[];
  awardMap: Record<string, AwardSlot[]>;
  players: Player[];
  tally: Record<string, Record<string, number>>;
}

export default function ManagerAwardsPage() {
  const { data: session } = useSession();
  const user = session?.user as Record<string, unknown> | undefined;
  const teamId = user?.teamId as string | null;
  const awardsEnabled = user?.teamEnableAwards !== false;

  const [data, setData] = useState<AwardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Award type dialog
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<AwardType | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");
  const [typeQuantity, setTypeQuantity] = useState("1");

  // Expanded rounds
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!teamId) return;
    const res = await fetch(`/api/teams/${teamId}/awards`);
    if (res.ok) {
      const d = await res.json();
      setData(d);
      // Auto-expand the most recent non-bye round
      const active = d.rounds.filter((r: RosterRound) => !r.isBye);
      if (active.length > 0) {
        setExpandedRounds(new Set([active[active.length - 1].id]));
      }
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // === Award Types ===
  function openAddType() {
    setEditingType(null);
    setTypeName("");
    setTypeDescription("");
    setTypeQuantity("1");
    setTypeDialogOpen(true);
  }

  function openEditType(t: AwardType) {
    setEditingType(t);
    setTypeName(t.name);
    setTypeDescription(t.description || "");
    setTypeQuantity(String(t.quantity));
    setTypeDialogOpen(true);
  }

  async function handleSaveType() {
    if (!teamId) return;
    setSaving(true);
    const body = { name: typeName, description: typeDescription, quantity: parseInt(typeQuantity) || 1 };
    const url = editingType
      ? `/api/teams/${teamId}/award-types/${editingType.id}`
      : `/api/teams/${teamId}/award-types`;
    const method = editingType ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      toast.success(editingType ? "Award type updated" : "Award type created");
      setTypeDialogOpen(false);
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to save");
    }
    setSaving(false);
  }

  async function handleDeleteType(id: string) {
    if (!teamId) return;
    if (!confirm("Delete this award type? All awards of this type will also be removed.")) return;
    const res = await fetch(`/api/teams/${teamId}/award-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Award type deleted");
      fetchData();
    } else {
      toast.error("Failed to delete");
    }
  }

  // === Award assignment ===
  async function handleAssign(roundId: string, awardTypeId: string, slot: number, playerId: string, notes: string) {
    if (!teamId) return;
    const res = await fetch(`/api/teams/${teamId}/awards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId, awardTypeId, slot, playerId: playerId || null, notes }),
    });
    if (res.ok) {
      // Optimistic update
      setData((prev) => {
        if (!prev) return prev;
        const key = `${roundId}:${awardTypeId}`;
        const existing = prev.awardMap[key] || [];
        let updated: AwardSlot[];
        if (!playerId) {
          updated = existing.filter((a) => a.slot !== slot);
        } else {
          const player = prev.players.find((p) => p.id === playerId);
          const newSlot: AwardSlot = { slot, playerId, playerName: player?.name || "", notes: notes || null };
          updated = [...existing.filter((a) => a.slot !== slot), newSlot].sort((a, b) => a.slot - b.slot);
        }
        // Rebuild tally
        const newAwardMap = { ...prev.awardMap, [key]: updated };
        const newTally: Record<string, Record<string, number>> = {};
        for (const slotArr of Object.values(newAwardMap)) {
          for (const a of slotArr) {
            if (!newTally[a.playerId]) newTally[a.playerId] = {};
            newTally[a.playerId][awardTypeId] = (newTally[a.playerId][awardTypeId] || 0) + 1;
          }
        }
        return { ...prev, awardMap: newAwardMap, tally: newTally };
      });
    } else {
      toast.error("Failed to save award");
      fetchData();
    }
  }

  function toggleRound(roundId: string) {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  }

  const activeRounds = data?.rounds.filter((r) => !r.isBye) || [];
  const awardTypes = data?.awardTypes || [];
  const players = data?.players || [];

  // Award eligibility: players missing each award type + players with no awards at all
  const eligibilityColumns = useMemo(() => {
    const columns: { label: string; players: Player[] }[] = [];

    for (const t of awardTypes) {
      const missing = players.filter((player) => {
        const playerTally = data?.tally[player.id] || {};
        return (playerTally[t.id] || 0) === 0;
      });
      columns.push({ label: `No ${t.name}`, players: missing });
    }

    const noAwards = players.filter((player) => {
      const playerTally = data?.tally[player.id] || {};
      const total = Object.values(playerTally).reduce((sum, n) => sum + n, 0);
      return total === 0;
    });
    columns.push({ label: "No Awards", players: noAwards });

    return columns;
  }, [awardTypes, players, data?.tally]);

  const eligibilityMaxRows = useMemo(() => {
    return Math.max(0, ...eligibilityColumns.map((c) => c.players.length));
  }, [eligibilityColumns]);

  if (!awardsEnabled) return <p className="text-gray-500">Awards are disabled for this team.</p>;
  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Team Awards</h1>

      {/* Award Types */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Award Types</h2>
          <Button onClick={openAddType}>Add Award Type</Button>
        </div>
        {awardTypes.length === 0 ? (
          <p className="text-gray-500 text-sm">No award types defined yet. Add your first one above.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {awardTypes.map((t) => (
              <Badge
                key={t.id}
                variant="outline"
                className="px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100 gap-2"
                onClick={() => openEditType(t)}
              >
                {t.name}
                {t.quantity > 1 && <span className="text-gray-400">×{t.quantity}</span>}
                <button
                  className="ml-1 text-gray-400 hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); handleDeleteType(t.id); }}
                >
                  &times;
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Round Awards */}
      {awardTypes.length > 0 && activeRounds.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Weekly Awards</h2>
          <div className="space-y-2">
            {activeRounds.map((round) => {
              const isExpanded = expandedRounds.has(round.id);
              const roundAwardCount = awardTypes.reduce((sum, t) => {
                const slots = data?.awardMap[`${round.id}:${t.id}`] || [];
                return sum + slots.filter((s) => s.playerId).length;
              }, 0);
              const totalSlots = awardTypes.reduce((sum, t) => sum + t.quantity, 0);

              return (
                <div key={round.id} className="border rounded-lg bg-white">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                    onClick={() => toggleRound(round.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium">Round {round.roundNumber}</span>
                      {round.opponent && <span className="text-gray-500 text-sm">vs {round.opponent}</span>}
                      {round.date && (
                        <span className="text-gray-400 text-sm">
                          {new Date(round.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{roundAwardCount}/{totalSlots} awarded</span>
                      <span className="text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t">
                      <div className="space-y-4 mt-4">
                        {awardTypes.map((awardType) => {
                          const slots = data?.awardMap[`${round.id}:${awardType.id}`] || [];
                          return (
                            <div key={awardType.id}>
                              <div className="font-medium text-sm mb-2">
                                {awardType.name}
                                {awardType.description && (
                                  <span className="text-gray-400 font-normal ml-2">{awardType.description}</span>
                                )}
                              </div>
                              <div className="space-y-2">
                                {Array.from({ length: awardType.quantity }).map((_, slot) => {
                                  const existing = slots.find((s) => s.slot === slot);
                                  return (
                                    <div key={slot} className="flex items-center gap-2">
                                      {awardType.quantity > 1 && (
                                        <span className="text-xs text-gray-400 w-12">#{slot + 1}</span>
                                      )}
                                      <Select
                                        value={existing?.playerId || ""}
                                        onChange={(e) => handleAssign(round.id, awardType.id, slot, e.target.value, existing?.notes || "")}
                                        className="flex-1 max-w-xs"
                                      >
                                        <option value="">— Select player —</option>
                                        {players.map((p) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </Select>
                                      <Input
                                        placeholder="Notes (optional)"
                                        value={existing?.notes || ""}
                                        onChange={(e) => {
                                          if (existing?.playerId) {
                                            handleAssign(round.id, awardType.id, slot, existing.playerId, e.target.value);
                                          }
                                        }}
                                        className="flex-1 max-w-xs text-sm"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Season Summary */}
      {awardTypes.length > 0 && players.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Season Summary</h2>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white">Player</TableHead>
                  {awardTypes.map((t) => (
                    <TableHead key={t.id} className="text-center">{t.name}</TableHead>
                  ))}
                  <TableHead className="text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player) => {
                  const playerTally = data?.tally[player.id] || {};
                  const total = Object.values(playerTally).reduce((sum, n) => sum + n, 0);
                  const neverWon = total === 0;
                  return (
                    <TableRow key={player.id} className={neverWon ? "bg-amber-50" : ""}>
                      <TableCell className="sticky left-0 bg-inherit font-medium">
                        {player.name}
                        {neverWon && <span className="ml-2 text-xs text-amber-600">no awards yet</span>}
                      </TableCell>
                      {awardTypes.map((t) => {
                        const count = playerTally[t.id] || 0;
                        return (
                          <TableCell key={t.id} className="text-center">
                            {count > 0 ? (
                              <span className="font-semibold text-green-700">{count}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-semibold">{total || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Award Eligibility */}
      {awardTypes.length > 0 && players.length > 0 && eligibilityMaxRows > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Award Eligibility</h2>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {eligibilityColumns.map((col) => (
                    <TableHead key={col.label} className="text-center">
                      {col.label}
                      <span className="ml-1 text-xs text-gray-400 font-normal">({col.players.length})</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: eligibilityMaxRows }).map((_, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {eligibilityColumns.map((col) => (
                      <TableCell key={col.label} className="text-center text-sm">
                        {col.players[rowIdx]?.name || ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {awardTypes.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p>Add award types above to start tracking weekly awards.</p>
        </div>
      )}

      {/* Award Type Dialog */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit Award Type" : "Add Award Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="e.g. McDonald's Voucher"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={typeDescription}
                onChange={(e) => setTypeDescription(e.target.value)}
                placeholder="e.g. For best effort on the day"
              />
            </div>
            <div>
              <Label>Awards per round</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={typeQuantity}
                onChange={(e) => setTypeQuantity(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">How many players receive this award each round</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveType} disabled={saving || !typeName.trim()}>
              {saving ? "Saving..." : editingType ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
