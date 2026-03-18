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

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface GlobalDutyRole {
  id: string;
  roleName: string;
}

interface Specialist {
  id: string;
  user: { id: string; name: string };
}

interface TeamRoleConfig {
  dutyRoleId: string;
  roleName: string;
  teamDutyRoleId: string | null;
  roleType: "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY";
  assignedUser: { id: string; name: string } | null;
  frequencyWeeks: number;
  slots: number;
  specialists: Specialist[];
  configured: boolean;
}

interface RosterRound {
  id: string;
  roundNumber: number;
  isBye: boolean;
  date: string | null;
  opponent: string | null;
}

interface RosterRole {
  id: string;
  roleName: string;
  roleType: string;
  slots: number;
}

interface RosterFamily {
  id: string;
  name: string;
}

interface RosterData {
  rounds: RosterRound[];
  roles: RosterRole[];
  assignments: Record<string, Array<{ familyId: string; familyName: string; slot: number }>>;
  families: RosterFamily[];
  dutyCounts: Record<string, Record<string, number>>;
}

const ROLE_TYPE_LABELS: Record<string, string> = {
  FIXED: "Fixed",
  SPECIALIST: "Specialist",
  ROTATING: "Rotating",
  FREQUENCY: "Frequency",
};

const ROLE_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  FIXED: "default",
  SPECIALIST: "secondary",
  ROTATING: "outline",
  FREQUENCY: "secondary",
};

export default function ManagerRosterPage() {
  const { data: session } = useSession();
  const teamId = (session?.user as Record<string, unknown>)?.teamId as string | null;

  const [teamRoles, setTeamRoles] = useState<TeamRoleConfig[]>([]);
  const [globalRoles, setGlobalRoles] = useState<GlobalDutyRole[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // Roster grid data
  const [rosterData, setRosterData] = useState<RosterData | null>(null);
  const [unavailabilities, setUnavailabilities] = useState<Set<string>>(new Set());
  const [showUnavailability, setShowUnavailability] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Club role dialog
  const [clubRoleDialogOpen, setClubRoleDialogOpen] = useState(false);
  const [clubRoleName, setClubRoleName] = useState("");

  // Team config dialog
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configRole, setConfigRole] = useState<TeamRoleConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    roleType: "ROTATING" as TeamRoleConfig["roleType"],
    assignedUserId: "",
    frequencyWeeks: "1",
    slots: "1",
    specialistUserIds: [] as string[],
  });

  // Override dialog
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideCell, setOverrideCell] = useState<{ roundId: string; roleId: string; roleName: string; roundNumber: number; slot: number } | null>(null);
  const [overrideFamilyId, setOverrideFamilyId] = useState("");

  // Single fetch for all page data
  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/manager/roster");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users);
    setGlobalRoles(data.globalRoles);
    setTeamRoles(data.teamRoles);
    setRosterData(data.roster);
    setUnavailabilities(new Set(data.unavailabilities.map((u: { familyId: string; roundId: string }) => `${u.familyId}:${u.roundId}`)));
    setPageLoading(false);
  }, []);

  // Lightweight refreshes after mutations (skip users which rarely change)
  const fetchGlobalRoles = useCallback(async () => {
    const res = await fetch("/api/duty-roles");
    if (res.ok) setGlobalRoles(await res.json());
  }, []);

  const fetchTeamRoles = useCallback(async () => {
    if (!teamId) return;
    const res = await fetch(`/api/teams/${teamId}/duty-roles`);
    if (res.ok) setTeamRoles(await res.json());
  }, [teamId]);

  const fetchRosterData = useCallback(async () => {
    if (!teamId) return;
    const res = await fetch(`/api/teams/${teamId}/roster`);
    if (res.ok) setRosterData(await res.json());
  }, [teamId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // === Club Role CRUD ===
  function openAddClubRole() {
    setClubRoleName("");
    setClubRoleDialogOpen(true);
  }

  async function handleSaveClubRole() {
    setLoading(true);
    const res = await fetch("/api/duty-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleName: clubRoleName }),
    });

    if (res.ok) {
      toast.success("Role created");
      setClubRoleDialogOpen(false);
      fetchGlobalRoles();
      fetchTeamRoles();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  // === Team Config ===
  function openConfigDialog(role: TeamRoleConfig) {
    setConfigRole(role);
    setConfigForm({
      roleType: role.roleType,
      assignedUserId: role.assignedUser?.id || "",
      frequencyWeeks: String(role.frequencyWeeks),
      slots: String(role.slots ?? 1),
      specialistUserIds: role.specialists.map((s) => s.user.id),
    });
    setConfigDialogOpen(true);
  }

  async function handleSaveConfig() {
    if (!teamId || !configRole) return;
    setLoading(true);

    const res = await fetch(`/api/teams/${teamId}/duty-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dutyRoleId: configRole.dutyRoleId,
        roleType: configForm.roleType,
        assignedUserId: configForm.roleType === "FIXED" ? configForm.assignedUserId : null,
        frequencyWeeks: configForm.roleType === "FREQUENCY" ? configForm.frequencyWeeks : "1",
        slots: configForm.slots,
        specialistUserIds: configForm.roleType === "SPECIALIST" ? configForm.specialistUserIds : [],
      }),
    });

    if (res.ok) {
      toast.success("Role configured");
      setConfigDialogOpen(false);
      fetchTeamRoles();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  function toggleSpecialist(userId: string) {
    setConfigForm((prev) => ({
      ...prev,
      specialistUserIds: prev.specialistUserIds.includes(userId)
        ? prev.specialistUserIds.filter((id) => id !== userId)
        : [...prev.specialistUserIds, userId],
    }));
  }

  function roleDetail(role: TeamRoleConfig): string {
    if (!role.configured) return "Not configured";
    const slotSuffix = (role.slots ?? 1) > 1 ? ` × ${role.slots}` : "";
    switch (role.roleType) {
      case "FIXED":
        return role.assignedUser?.name || "Unassigned";
      case "SPECIALIST":
        return (role.specialists.map((s) => s.user.name).join(", ") || "No specialists") + slotSuffix;
      case "FREQUENCY":
        return `Every ${role.frequencyWeeks} week${role.frequencyWeeks !== 1 ? "s" : ""}${slotSuffix}`;
      case "ROTATING":
        return "All families" + slotSuffix;
    }
  }

  // === Roster Generation ===
  async function handleGenerate() {
    if (!teamId) return;
    if (!confirm("This will overwrite any existing roster assignments for this team. Continue?")) return;

    setGenerating(true);
    const res = await fetch(`/api/teams/${teamId}/roster/generate`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Roster generated — ${data.count} assignments created`);
      fetchRosterData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to generate roster");
    }
    setGenerating(false);
  }

  // === Unavailability Toggle ===
  async function toggleUnavailability(familyId: string, roundId: string) {
    if (!teamId) return;
    const key = `${familyId}:${roundId}`;
    const isUnavailable = unavailabilities.has(key);

    const res = await fetch(`/api/teams/${teamId}/unavailability`, {
      method: isUnavailable ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ familyId, roundId }),
    });

    if (res.ok) {
      setUnavailabilities((prev) => {
        const next = new Set(prev);
        if (isUnavailable) next.delete(key);
        else next.add(key);
        return next;
      });
    }
  }

  // === Manual Override ===
  function openOverrideDialog(roundId: string, roleId: string, roleName: string, roundNumber: number, slot: number) {
    const slotData = rosterData?.assignments[`${roundId}:${roleId}`]?.find((a) => a.slot === slot);
    setOverrideCell({ roundId, roleId, roleName, roundNumber, slot });
    setOverrideFamilyId(slotData?.familyId || "");
    setOverrideDialogOpen(true);
  }

  async function handleOverride() {
    if (!overrideCell || !teamId) return;
    setLoading(true);

    const res = await fetch(`/api/teams/${teamId}/roster/assign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId: overrideCell.roundId,
        teamDutyRoleId: overrideCell.roleId,
        assignedFamilyId: overrideFamilyId || null,
        slot: overrideCell.slot,
      }),
    });

    if (res.ok) {
      toast.success("Assignment updated");
      setOverrideDialogOpen(false);
      fetchRosterData();
    } else {
      toast.error("Failed to update");
    }
    setLoading(false);
  }

  const activeRounds = rosterData?.rounds.filter((r) => !r.isBye) || [];
  const hasAssignments = rosterData && Object.keys(rosterData.assignments).length > 0;

  if (pageLoading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Duty Roster</h1>

      {/* Club Roles Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Duty Roles</h2>
          <Button onClick={openAddClubRole}>Add Role</Button>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Roles are shared across the club. Configure how your team fills each one below.
        </p>
        <div className="flex gap-2 flex-wrap">
          {globalRoles.length === 0 ? (
            <p className="text-gray-500">No roles defined yet. Add your first role above.</p>
          ) : (
            globalRoles.map((role) => (
              <Badge key={role.id} variant="outline" className="px-3 py-1.5 text-sm">
                {role.roleName}
              </Badge>
            ))
          )}
        </div>
      </div>

      {/* Team role configuration */}
      {teamRoles.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mb-4">Role Configuration</h2>
          <div className="bg-white rounded-lg border mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamRoles.map((role) => (
                  <TableRow key={role.dutyRoleId}>
                    <TableCell className="font-medium">{role.roleName}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_TYPE_VARIANTS[role.roleType]}>
                        {ROLE_TYPE_LABELS[role.roleType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{roleDetail(role)}</TableCell>
                    <TableCell>
                      {role.configured ? (
                        <Badge className="bg-green-600">Configured</Badge>
                      ) : (
                        <Badge variant="outline">Default</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openConfigDialog(role)}>
                        Configure
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Unavailability Section */}
      {rosterData && rosterData.families.length > 0 && activeRounds.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xl font-semibold">Family Unavailability</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUnavailability(!showUnavailability)}
            >
              {showUnavailability ? "Hide" : "Show"}
            </Button>
          </div>

          {showUnavailability && (
            <div className="bg-white rounded-lg border overflow-x-auto mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-white z-10 min-w-[150px]">Family</TableHead>
                    {activeRounds.map((r) => (
                      <TableHead key={r.id} className="text-center min-w-[60px]">
                        R{r.roundNumber}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rosterData.families.map((family) => (
                    <TableRow key={family.id}>
                      <TableCell className="sticky left-0 bg-white z-10 font-medium">
                        {family.name}
                      </TableCell>
                      {activeRounds.map((round) => {
                        const isUnavailable = unavailabilities.has(`${family.id}:${round.id}`);
                        return (
                          <TableCell key={round.id} className="text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 cursor-pointer"
                              checked={isUnavailable}
                              onChange={() => toggleUnavailability(family.id, round.id)}
                              title={isUnavailable ? "Mark available" : "Mark unavailable"}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      {teamRoles.length > 0 && (
        <div className="flex items-center gap-4 mb-6">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating..." : hasAssignments ? "Regenerate Roster" : "Generate Roster"}
          </Button>
          {hasAssignments && (
            <p className="text-sm text-gray-500">
              {Object.keys(rosterData!.assignments).length} assignments across {activeRounds.length} rounds
            </p>
          )}
          {rosterData && rosterData.families.length === 0 && (
            <p className="text-sm text-amber-600">
              No families linked. Players must have a linked family user to be rostered.
            </p>
          )}
        </div>
      )}

      {/* Roster Grid */}
      {hasAssignments && rosterData && rosterData.roles.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Roster</h2>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10 min-w-[150px]">Role</TableHead>
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
                {rosterData.roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">
                      <div className="flex items-center gap-2">
                        {role.roleName}
                        <Badge variant={ROLE_TYPE_VARIANTS[role.roleType] || "outline"} className="text-xs">
                          {ROLE_TYPE_LABELS[role.roleType] || role.roleType}
                        </Badge>
                      </div>
                    </TableCell>
                    {activeRounds.map((round) => {
                      const slotAssignments = rosterData.assignments[`${round.id}:${role.id}`] || [];
                      const isFixed = role.roleType === "FIXED";
                      const totalSlots = role.slots ?? 1;
                      return (
                        <TableCell key={round.id} className={`text-center text-sm align-top py-2 ${isFixed ? "bg-gray-50 text-gray-500" : ""}`}>
                          <div className="flex flex-col gap-0.5">
                            {Array.from({ length: totalSlots }).map((_, slot) => {
                              const a = slotAssignments.find((x) => x.slot === slot);
                              return (
                                <div
                                  key={slot}
                                  className={isFixed ? "" : "cursor-pointer hover:bg-blue-50 rounded px-1"}
                                  onClick={() => { if (!isFixed) openOverrideDialog(round.id, role.id, role.roleName, round.roundNumber, slot); }}
                                >
                                  {a ? a.familyName : <span className="text-gray-300">—</span>}
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-gray-400 mt-2">Click a cell to reassign. Fixed roles cannot be changed.</p>
        </div>
      )}

      {/* Duty Counts Summary */}
      {hasAssignments && rosterData && rosterData.families.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Duty Tally</h2>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10 min-w-[150px]">Family</TableHead>
                  {rosterData.roles.filter((r) => r.roleType !== "FIXED").map((role) => (
                    <TableHead key={role.id} className="text-center min-w-[100px] text-xs">
                      {role.roleName}
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[70px] font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rosterData.families.map((family) => {
                  const counts = rosterData.dutyCounts[family.id] || {};
                  const rotatingRoles = rosterData.roles.filter((r) => r.roleType !== "FIXED");
                  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
                  return (
                    <TableRow key={family.id}>
                      <TableCell className="sticky left-0 bg-white z-10 font-medium">{family.name}</TableCell>
                      {rotatingRoles.map((role) => (
                        <TableCell key={role.id} className="text-center text-sm">
                          {counts[role.id] ? (
                            <span className="font-medium">{counts[role.id]}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">{total || <span className="text-gray-300">0</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Club Role Dialog */}
      <Dialog open={clubRoleDialogOpen} onOpenChange={setClubRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role Name *</Label>
              <Input
                value={clubRoleName}
                onChange={(e) => setClubRoleName(e.target.value)}
                placeholder="e.g. Goal Umpire, Canteen, Photographer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClubRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveClubRole} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Config Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure: {configRole?.roleName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role Type *</Label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={configForm.roleType}
                onChange={(e) => setConfigForm({
                  ...configForm,
                  roleType: e.target.value as TeamRoleConfig["roleType"],
                  assignedUserId: "",
                  specialistUserIds: [],
                  frequencyWeeks: "1",
                  slots: "1",
                })}
              >
                <option value="ROTATING">Rotating — any family each round</option>
                <option value="FIXED">Fixed — same person every round</option>
                <option value="SPECIALIST">Specialist — only specific people</option>
                <option value="FREQUENCY">Frequency — rotating, every N weeks</option>
              </select>
            </div>

            {configForm.roleType !== "FIXED" && (
              <div className="space-y-2">
                <Label>People required per round</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={configForm.slots}
                  onChange={(e) => setConfigForm({ ...configForm, slots: e.target.value })}
                />
                <p className="text-xs text-gray-500">How many families are needed for this duty each round</p>
              </div>
            )}

            {configForm.roleType === "FIXED" && (
              <div className="space-y-2">
                <Label>Assigned Person *</Label>
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={configForm.assignedUserId}
                  onChange={(e) => setConfigForm({ ...configForm, assignedUserId: e.target.value })}
                >
                  <option value="">Select a person...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
            )}

            {configForm.roleType === "SPECIALIST" && (
              <div className="space-y-2">
                <Label>Eligible Specialists *</Label>
                <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
                  {users.length === 0 ? (
                    <p className="text-sm text-gray-500 p-2">No users found</p>
                  ) : (
                    users.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={configForm.specialistUserIds.includes(u.id)}
                          onChange={() => toggleSpecialist(u.id)}
                        />
                        <span className="text-sm">{u.name}</span>
                        <span className="text-xs text-gray-400">({u.role})</span>
                      </label>
                    ))
                  )}
                </div>
                {configForm.specialistUserIds.length > 0 && (
                  <p className="text-xs text-gray-500">{configForm.specialistUserIds.length} selected</p>
                )}
              </div>
            )}

            {configForm.roleType === "FREQUENCY" && (
              <div className="space-y-2">
                <Label>Fill every N weeks</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={configForm.frequencyWeeks}
                  onChange={(e) => setConfigForm({ ...configForm, frequencyWeeks: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  e.g. &quot;3&quot; means this role is assigned every 3rd round
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveConfig} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {overrideCell?.roleName}{overrideCell && overrideCell.slot > 0 ? ` (slot ${overrideCell.slot + 1})` : ""} — Round {overrideCell?.roundNumber}
            </DialogTitle>
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
            <Button onClick={handleOverride} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
