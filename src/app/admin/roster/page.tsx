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
  specialists: Specialist[];
  configured: boolean;
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
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Club role dialog
  const [clubRoleDialogOpen, setClubRoleDialogOpen] = useState(false);
  const [editingClubRole, setEditingClubRole] = useState<GlobalDutyRole | null>(null);
  const [clubRoleName, setClubRoleName] = useState("");

  // Team config dialog
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configRole, setConfigRole] = useState<TeamRoleConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    roleType: "ROTATING" as TeamRoleConfig["roleType"],
    assignedUserId: "",
    frequencyWeeks: "1",
    specialistUserIds: [] as string[],
  });

  const fetchSeasons = useCallback(async () => {
    const res = await fetch("/api/season");
    if (res.ok) setSeasons(await res.json());
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }, []);

  const fetchGlobalRoles = useCallback(async () => {
    const res = await fetch("/api/duty-roles");
    if (res.ok) setGlobalRoles(await res.json());
  }, []);

  const fetchTeamRoles = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/teams/${teamId}/duty-roles`);
    if (res.ok) setTeamRoles(await res.json());
  }, []);

  useEffect(() => { fetchSeasons(); fetchUsers(); fetchGlobalRoles(); }, [fetchSeasons, fetchUsers, fetchGlobalRoles]);

  useEffect(() => {
    if (selectedTeam) fetchTeamRoles(selectedTeam.id);
  }, [selectedTeam, fetchTeamRoles]);

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
      assignedUserId: role.assignedUser?.id || "",
      frequencyWeeks: String(role.frequencyWeeks),
      specialistUserIds: role.specialists.map((s) => s.user.id),
    });
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
        assignedUserId: configForm.roleType === "FIXED" ? configForm.assignedUserId : null,
        frequencyWeeks: configForm.roleType === "FREQUENCY" ? configForm.frequencyWeeks : "1",
        specialistUserIds: configForm.roleType === "SPECIALIST" ? configForm.specialistUserIds : [],
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
    switch (role.roleType) {
      case "FIXED":
        return role.assignedUser?.name || "Unassigned";
      case "SPECIALIST":
        return role.specialists.map((s) => s.user.name).join(", ") || "No specialists";
      case "FREQUENCY":
        return `Every ${role.frequencyWeeks} week${role.frequencyWeeks !== 1 ? "s" : ""}`;
      case "ROTATING":
        return "All families";
    }
  }

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
            globalRoles.map((role) => (
              <Badge
                key={role.id}
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
            <p className="text-gray-500">No club roles defined. Add roles above first.</p>
          ) : (
            <div className="bg-white rounded-lg border">
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
                  assignedUserId: "",
                  specialistUserIds: [],
                  frequencyWeeks: "1",
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
    </div>
  );
}
