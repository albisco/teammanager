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
import { toast } from "sonner";

interface TeamSummary {
  id: string;
  name: string;
  ageGroup: string;
}

interface Season {
  id: string;
  name: string;
  year: number;
  teams: TeamSummary[];
}

interface GlobalDutyRole {
  id: string;
  roleName: string;
  sortOrder: number;
}

interface SpecialistEntry {
  id: string;
  personName: string;
  familyId: string | null;
}

interface TeamRoleConfig {
  dutyRoleId: string;
  roleName: string;
  teamDutyRoleId: string | null;
  roleType: "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY";
  assignedPersonName: string | null;
  assignedFamilyId: string | null;
  frequencyWeeks: number;
  slots: number;
  specialists: SpecialistEntry[];
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

export default function RosterPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);
  const [teamRoles, setTeamRoles] = useState<TeamRoleConfig[]>([]);
  const [globalRoles, setGlobalRoles] = useState<GlobalDutyRole[]>([]);
  const [loading, setLoading] = useState(false);

  // Roster grid data
  const [rosterData, setRosterData] = useState<RosterData | null>(null);
  const [unavailabilities, setUnavailabilities] = useState<Set<string>>(new Set());
  const [showUnavailability, setShowUnavailability] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Club role dialog
  const [clubRoleDialogOpen, setClubRoleDialogOpen] = useState(false);
  const [editingClubRole, setEditingClubRole] = useState<GlobalDutyRole | null>(null);
  const [clubRoleName, setClubRoleName] = useState("");

  // Team config dialog
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configRole, setConfigRole] = useState<TeamRoleConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    roleType: "ROTATING" as TeamRoleConfig["roleType"],
    assignedPersonName: "",
    assignedFamilyId: null as string | null,
    frequencyWeeks: "1",
    slots: "1",
    specialists: [] as { personName: string; familyId: string | null }[],
  });
  const [customSpecialistName, setCustomSpecialistName] = useState("");

  // Override dialog
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideCell, setOverrideCell] = useState<{ roundId: string; roleId: string; roleName: string; roundNumber: number } | null>(null);
  const [overrideFamilyId, setOverrideFamilyId] = useState("");


  const fetchSeasons = useCallback(async () => {
    const res = await fetch("/api/season");
    if (res.ok) setSeasons(await res.json());
  }, []);

  const fetchGlobalRoles = useCallback(async () => {
    const res = await fetch("/api/duty-roles");
    if (res.ok) setGlobalRoles(await res.json());
  }, []);

  const fetchTeamRoles = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/teams/${teamId}/duty-roles`);
    if (res.ok) setTeamRoles(await res.json());
  }, []);

  const fetchRosterData = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/teams/${teamId}/roster`);
    if (res.ok) setRosterData(await res.json());
  }, []);

  const fetchUnavailabilities = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/teams/${teamId}/unavailability`);
    if (res.ok) {
      const records: { familyId: string; roundId: string }[] = await res.json();
      setUnavailabilities(new Set(records.map((r) => `${r.familyId}:${r.roundId}`)));
    }
  }, []);

  useEffect(() => { fetchSeasons(); fetchGlobalRoles(); }, [fetchSeasons, fetchGlobalRoles]);

  useEffect(() => {
    if (selectedTeam) {
      fetchTeamRoles(selectedTeam.id);
      fetchRosterData(selectedTeam.id);
      fetchUnavailabilities(selectedTeam.id);
    }
  }, [selectedTeam, fetchTeamRoles, fetchRosterData, fetchUnavailabilities]);

  // Drag-and-drop reordering for club roles
  const [roleDragIndex, setRoleDragIndex] = useState<number | null>(null);
  const [roleDragOverIndex, setRoleDragOverIndex] = useState<number | null>(null);

  async function handleRoleDrop(targetIndex: number) {
    if (roleDragIndex === null || roleDragIndex === targetIndex) {
      setRoleDragIndex(null);
      setRoleDragOverIndex(null);
      return;
    }

    const newRoles = [...globalRoles];
    const [moved] = newRoles.splice(roleDragIndex, 1);
    newRoles.splice(targetIndex, 0, moved);

    // Optimistic update
    setGlobalRoles(newRoles);
    setRoleDragIndex(null);
    setRoleDragOverIndex(null);

    const res = await fetch("/api/duty-roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: newRoles.map((r) => r.id) }),
    });

    if (!res.ok) {
      fetchGlobalRoles();
      toast.error("Failed to update order");
    }
  }

  // === Club Role CRUD ===
  function openAddClubRole() {
    setEditingClubRole(null);
    setClubRoleName("");
    setClubRoleDialogOpen(true);
  }

  function openEditClubRole(role: GlobalDutyRole) {
    setEditingClubRole(role);
    setClubRoleName(role.roleName);
    setClubRoleDialogOpen(true);
  }

  async function handleSaveClubRole() {
    setLoading(true);
    const method = editingClubRole ? "PUT" : "POST";
    const body = editingClubRole
      ? { id: editingClubRole.id, roleName: clubRoleName }
      : { roleName: clubRoleName };

    const res = await fetch("/api/duty-roles", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      toast.success(editingClubRole ? "Role renamed" : "Role created");
      setClubRoleDialogOpen(false);
      fetchGlobalRoles();
      if (selectedTeam) fetchTeamRoles(selectedTeam.id);
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  async function handleDeleteClubRole(id: string) {
    if (!confirm("Delete this role from the club? This will remove it from all teams.")) return;
    const res = await fetch("/api/duty-roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success("Role deleted");
      fetchGlobalRoles();
      if (selectedTeam) fetchTeamRoles(selectedTeam.id);
    }
  }

  // === Team Config ===
  function openConfigDialog(role: TeamRoleConfig) {
    setConfigRole(role);
    setConfigForm({
      roleType: role.roleType,
      assignedPersonName: role.assignedPersonName || "",
      assignedFamilyId: role.assignedFamilyId || null,
      frequencyWeeks: String(role.frequencyWeeks),
      slots: String(role.slots ?? 1),
      specialists: role.specialists.map((s) => ({ personName: s.personName, familyId: s.familyId })),
    });
    setCustomSpecialistName("");
    setConfigDialogOpen(true);
  }

  async function handleSaveConfig() {
    if (!selectedTeam || !configRole) return;
    setLoading(true);

    const res = await fetch(`/api/teams/${selectedTeam.id}/duty-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dutyRoleId: configRole.dutyRoleId,
        roleType: configForm.roleType,
        assignedPersonName: configForm.roleType === "FIXED" ? configForm.assignedPersonName : null,
        assignedFamilyId: configForm.roleType === "FIXED" ? configForm.assignedFamilyId : null,
        frequencyWeeks: configForm.roleType === "FREQUENCY" ? configForm.frequencyWeeks : "1",
        slots: configForm.slots,
        specialists: configForm.roleType === "SPECIALIST" ? configForm.specialists : [],
      }),
    });

    if (res.ok) {
      toast.success("Role configured");
      setConfigDialogOpen(false);
      fetchTeamRoles(selectedTeam.id);
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  function addCustomSpecialist() {
    const name = customSpecialistName.trim();
    if (!name) return;
    if (configForm.specialists.some((s) => s.personName === name)) return;
    setConfigForm((prev) => ({
      ...prev,
      specialists: [...prev.specialists, { personName: name, familyId: null }],
    }));
    setCustomSpecialistName("");
  }

  function removeSpecialist(index: number) {
    setConfigForm((prev) => ({
      ...prev,
      specialists: prev.specialists.filter((_, i) => i !== index),
    }));
  }

  /** Build full name for a specialist: "Gav Prendergast" for family-linked, just name for external */
  function specialistFullName(s: { personName: string; familyId: string | null }): string {
    return s.personName;
  }

  /** Resolve the display name for a roster cell: full name for specialist/fixed, surname for others */
  function resolveAssignName(teamDutyRoleId: string, familyId: string): string {
    const role = teamRoles.find((r) => r.teamDutyRoleId === teamDutyRoleId);
    if (role?.roleType === "SPECIALIST") {
      const specialist = role.specialists.find((s) => {
        const sId = s.familyId || `external_${s.personName.toLowerCase().replace(/\s+/g, "_")}`;
        return sId === familyId;
      });
      if (specialist) return specialistFullName(specialist);
    }
    if (role?.roleType === "FIXED" && role.assignedPersonName && role.assignedFamilyId === familyId) {
      return role.assignedPersonName;
    }
    return rosterData?.families.find((f) => f.id === familyId)?.name || familyId;
  }

  function roleDetail(role: TeamRoleConfig): string {
    if (!role.configured) return "Not configured";
    const slotSuffix = (role.slots ?? 1) > 1 ? ` x ${role.slots}` : "";
    switch (role.roleType) {
      case "FIXED": {
        if (!role.assignedPersonName) return "Unassigned";
        return role.assignedPersonName;
      }
      case "SPECIALIST":
        return (role.specialists.map((s) => specialistFullName(s)).join(", ") || "No specialists") + slotSuffix;
      case "FREQUENCY":
        return `Every ${role.frequencyWeeks} week${role.frequencyWeeks !== 1 ? "s" : ""}${slotSuffix}`;
      case "ROTATING":
        return "All families" + slotSuffix;
    }
  }

  // === Roster Generation ===
  async function handleGenerate() {
    if (!selectedTeam) return;
    if (!confirm("This will overwrite any existing roster assignments for this team. Continue?")) return;

    setGenerating(true);
    const res = await fetch(`/api/teams/${selectedTeam.id}/roster/generate`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Roster generated — ${data.count} assignments created`);
      fetchRosterData(selectedTeam.id);
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to generate roster");
    }
    setGenerating(false);
  }

  // === Unavailability Toggle ===
  async function toggleUnavailability(familyId: string, roundId: string) {
    if (!selectedTeam) return;
    const key = `${familyId}:${roundId}`;
    const isUnavailable = unavailabilities.has(key);

    const res = await fetch(`/api/teams/${selectedTeam.id}/unavailability`, {
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
  function openOverrideDialog(roundId: string, roleId: string, roleName: string, roundNumber: number) {
    const current = rosterData?.assignments[`${roundId}:${roleId}`]?.[0];
    setOverrideCell({ roundId, roleId, roleName, roundNumber });
    setOverrideFamilyId(current?.familyId || "");
    setOverrideDialogOpen(true);
  }

  async function handleOverride() {
    if (!overrideCell || !selectedTeam) return;
    setLoading(true);

    const res = await fetch(`/api/teams/${selectedTeam.id}/roster/assign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId: overrideCell.roundId,
        teamDutyRoleId: overrideCell.roleId,
        assignedFamilyId: overrideFamilyId || null,
        assignedFamilyName: overrideFamilyId ? resolveAssignName(overrideCell.roleId, overrideFamilyId) : null,
      }),
    });

    if (res.ok) {
      toast.success("Assignment updated");
      setOverrideDialogOpen(false);
      fetchRosterData(selectedTeam.id);
    } else {
      toast.error("Failed to update");
    }
    setLoading(false);
  }

  const activeRounds = rosterData?.rounds.filter((r) => !r.isBye) || [];
  const hasAssignments = rosterData && Object.keys(rosterData.assignments).length > 0;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Duty Roster</h1>

      {/* Club Roles Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Club Duty Roles</h2>
          <Button onClick={openAddClubRole}>Add Role</Button>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          These roles apply to all teams. Each team configures how they fill them.
        </p>
        <div className="flex gap-2 flex-wrap">
          {globalRoles.length === 0 ? (
            <p className="text-gray-500">No roles defined yet.</p>
          ) : (
            globalRoles.map((role, index) => (
              <div
                key={role.id}
                draggable
                onDragStart={() => setRoleDragIndex(index)}
                onDragEnd={() => { setRoleDragIndex(null); setRoleDragOverIndex(null); }}
                onDragOver={(e) => { e.preventDefault(); setRoleDragOverIndex(index); }}
                onDrop={() => handleRoleDrop(index)}
                className={[
                  "flex items-center transition-all",
                  roleDragOverIndex === index && roleDragIndex !== index ? "ring-2 ring-primary rounded-md" : "",
                  roleDragIndex === index ? "opacity-50" : "",
                ].join(" ")}
              >
                <span className="cursor-grab text-gray-400 hover:text-gray-600 mr-1 select-none" title="Drag to reorder">⠿</span>
                <Badge
                  variant="outline"
                  className="px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100 gap-2"
                  onClick={() => openEditClubRole(role)}
                >
                  {role.roleName}
                  <button
                    className="ml-1 text-gray-400 hover:text-red-500"
                    onClick={(e) => { e.stopPropagation(); handleDeleteClubRole(role.id); }}
                  >
                    &times;
                  </button>
                </Badge>
              </div>
            ))
          )}
        </div>
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

      {/* Team role configuration */}
      {selectedTeam && (
        <>
          <h2 className="text-xl font-semibold mb-4">
            {selectedTeam.ageGroup} {selectedTeam.name} — Role Configuration
          </h2>

          {teamRoles.length === 0 ? (
            <p className="text-gray-500 mb-6">No club roles defined. Add roles above first.</p>
          ) : (
            <div className="bg-card rounded-lg border mb-6">
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
                <div className="bg-card rounded-lg border overflow-x-auto mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card z-10 min-w-[150px]">Family</TableHead>
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
                          <TableCell className="sticky left-0 bg-card z-10 font-medium">
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
                                  title={isUnavailable ? "Available" : "Mark unavailable"}
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
                  No players found on this team. Add players to the team first.
                </p>
              )}
            </div>
          )}

          {/* Roster Grid */}
          {hasAssignments && rosterData && rosterData.roles.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4">Roster</h2>
              <div className="bg-card rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[150px]">Role</TableHead>
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
                        <TableCell className="sticky left-0 bg-card z-10 font-medium">
                          <div className="flex items-center gap-2">
                            {role.roleName}
                            <Badge variant={ROLE_TYPE_VARIANTS[role.roleType] || "outline"} className="text-xs">
                              {ROLE_TYPE_LABELS[role.roleType] || role.roleType}
                            </Badge>
                          </div>
                        </TableCell>
                        {activeRounds.map((round) => {
                          const assignments = rosterData.assignments[`${round.id}:${role.id}`];
                          const assignment = assignments?.[0];
                          return (
                            <TableCell
                              key={round.id}
                              className="text-center text-sm cursor-pointer hover:bg-blue-50"
                              onClick={() => {
                                openOverrideDialog(round.id, role.id, role.roleName, round.roundNumber);
                              }}
                            >
                              {assignment ? (
                                <span>{resolveAssignName(role.id, assignment.familyId)}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-gray-400 mt-2">Click a cell to reassign. Fixed roles cannot be changed here.</p>
            </div>
          )}
        </>
      )}

      {/* Club Role Dialog */}
      <Dialog open={clubRoleDialogOpen} onOpenChange={setClubRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClubRole ? "Edit Club Role" : "Add Club Role"}</DialogTitle>
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
                  assignedPersonName: "",
                  assignedFamilyId: null,
                  specialists: [],
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

            {configForm.roleType === "FIXED" && (
              <div className="space-y-2">
                <Label>Assigned Person *</Label>
                <Input
                  placeholder="Type person's name (e.g. Kylie)"
                  value={configForm.assignedPersonName}
                  onChange={(e) => setConfigForm({ ...configForm, assignedPersonName: e.target.value, assignedFamilyId: null })}
                />
              </div>
            )}

            {configForm.roleType === "SPECIALIST" && (
              <div className="space-y-2">
                <Label>Eligible Specialists *</Label>
                {configForm.specialists.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {configForm.specialists.map((s, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                        {s.personName}
                        <button
                          className="ml-0.5 text-gray-400 hover:text-red-500"
                          onClick={() => removeSpecialist(i)}
                        >
                          &times;
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Type person's name"
                    value={customSpecialistName}
                    onChange={(e) => setCustomSpecialistName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSpecialist(); } }}
                  />
                  <Button variant="outline" size="sm" onClick={addCustomSpecialist} disabled={!customSpecialistName.trim()}>
                    Add
                  </Button>
                </div>
                <p className="text-xs text-gray-500">{configForm.specialists.length} selected</p>
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
              {overrideCell?.roleName} — Round {overrideCell?.roundNumber}
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
