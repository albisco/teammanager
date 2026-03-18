"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface RosterRound {
  id: string;
  roundNumber: number;
  isBye: boolean;
  opponent: string | null;
}

interface RosterRole {
  id: string;
  roleName: string;
  roleType: string;
}

interface RosterFamily {
  id: string;
  name: string;
}

interface RosterData {
  rounds: RosterRound[];
  roles: RosterRole[];
  assignments: Record<string, { familyId: string; familyName: string }>;
  families: RosterFamily[];
}

const ROLE_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  FIXED: "default",
  SPECIALIST: "secondary",
  ROTATING: "outline",
  FREQUENCY: "secondary",
};

export default function ManagerRosterPage() {
  const { data: session } = useSession();
  const teamId = (session?.user as Record<string, unknown>)?.teamId as string | null;

  const [rosterData, setRosterData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideCell, setOverrideCell] = useState<{ roundId: string; roleId: string; roleName: string; roundNumber: number } | null>(null);
  const [overrideFamilyId, setOverrideFamilyId] = useState("");

  const fetchRoster = useCallback(async () => {
    if (!teamId) return;
    const res = await fetch(`/api/teams/${teamId}/roster`);
    if (res.ok) setRosterData(await res.json());
    setLoading(false);
  }, [teamId]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  function openOverride(roundId: string, roleId: string, roleName: string, roundNumber: number) {
    const current = rosterData?.assignments[`${roundId}:${roleId}`];
    setOverrideCell({ roundId, roleId, roleName, roundNumber });
    setOverrideFamilyId(current?.familyId || "");
    setOverrideDialogOpen(true);
  }

  async function handleOverride() {
    if (!overrideCell || !teamId) return;
    setSaving(true);
    const res = await fetch(`/api/teams/${teamId}/roster/assign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId: overrideCell.roundId,
        teamDutyRoleId: overrideCell.roleId,
        assignedFamilyId: overrideFamilyId || null,
      }),
    });
    if (res.ok) {
      toast.success("Assignment updated");
      setOverrideDialogOpen(false);
      fetchRoster();
    } else {
      toast.error("Failed to update");
    }
    setSaving(false);
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const activeRounds = rosterData?.rounds.filter((r) => !r.isBye) || [];
  const hasAssignments = rosterData && Object.keys(rosterData.assignments).length > 0;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Roster</h1>

      {!hasAssignments ? (
        <p className="text-gray-500">No roster generated yet. Contact your club admin to generate the roster.</p>
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-x-auto mb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10 min-w-[160px]">Role</TableHead>
                  {activeRounds.map((r) => (
                    <TableHead key={r.id} className="text-center min-w-[100px]">
                      <div>R{r.roundNumber}</div>
                      {r.opponent && (
                        <div className="text-xs font-normal text-gray-400">{r.opponent}</div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rosterData!.roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">
                      <div className="flex items-center gap-2">
                        {role.roleName}
                        <Badge variant={ROLE_TYPE_VARIANTS[role.roleType] || "outline"} className="text-xs">
                          {role.roleType}
                        </Badge>
                      </div>
                    </TableCell>
                    {activeRounds.map((round) => {
                      const assignment = rosterData!.assignments[`${round.id}:${role.id}`];
                      const isFixed = role.roleType === "FIXED";
                      return (
                        <TableCell
                          key={round.id}
                          className={`text-center text-sm ${isFixed ? "bg-gray-50 text-gray-500" : "cursor-pointer hover:bg-blue-50"}`}
                          onClick={() => { if (!isFixed) openOverride(round.id, role.id, role.roleName, round.roundNumber); }}
                        >
                          {assignment ? assignment.familyName : <span className="text-gray-300">—</span>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-gray-400">Click a cell to reassign. Fixed roles cannot be changed.</p>
        </>
      )}

      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{overrideCell?.roleName} — Round {overrideCell?.roundNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assign to Family</Label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={overrideFamilyId}
                onChange={(e) => setOverrideFamilyId(e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {rosterData?.families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleOverride} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
