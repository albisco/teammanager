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

interface Specialist {
  id: string;
  userId: string;
  user: { id: string; name: string };
}

interface DutyRole {
  id: string;
  roleName: string;
  roleType: "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY";
  assignedUser: { id: string; name: string } | null;
  frequencyWeeks: number;
  specialists: Specialist[];
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
  const [dutyRoles, setDutyRoles] = useState<DutyRole[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Role dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({
    roleName: "",
    roleType: "ROTATING" as DutyRole["roleType"],
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

  const fetchDutyRoles = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/teams/${teamId}/duty-roles`);
    if (res.ok) setDutyRoles(await res.json());
  }, []);

  useEffect(() => { fetchSeasons(); fetchUsers(); }, [fetchSeasons, fetchUsers]);

  useEffect(() => {
    if (selectedTeam) fetchDutyRoles(selectedTeam.id);
  }, [selectedTeam, fetchDutyRoles]);

  function openAddRole() {
    setEditingRoleId(null);
    setRoleForm({
      roleName: "",
      roleType: "ROTATING",
      assignedUserId: "",
      frequencyWeeks: "1",
      specialistUserIds: [],
    });
    setRoleDialogOpen(true);
  }

  function openEditRole(role: DutyRole) {
    setEditingRoleId(role.id);
    setRoleForm({
      roleName: role.roleName,
      roleType: role.roleType,
      assignedUserId: role.assignedUser?.id || "",
      frequencyWeeks: String(role.frequencyWeeks),
      specialistUserIds: role.specialists.map((s) => s.user.id),
    });
    setRoleDialogOpen(true);
  }

  async function handleSaveRole() {
    if (!selectedTeam) return;
    setLoading(true);

    const payload = {
      roleName: roleForm.roleName,
      roleType: roleForm.roleType,
      assignedUserId: roleForm.roleType === "FIXED" ? roleForm.assignedUserId : null,
      frequencyWeeks: roleForm.roleType === "FREQUENCY" ? roleForm.frequencyWeeks : "1",
      specialistUserIds: roleForm.roleType === "SPECIALIST" ? roleForm.specialistUserIds : [],
    };

    const url = editingRoleId
      ? `/api/teams/${selectedTeam.id}/duty-roles/${editingRoleId}`
      : `/api/teams/${selectedTeam.id}/duty-roles`;
    const method = editingRoleId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(editingRoleId ? "Role updated" : "Role created");
      setRoleDialogOpen(false);
      fetchDutyRoles(selectedTeam.id);
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  async function handleDeleteRole(roleId: string) {
    if (!selectedTeam) return;
    if (!confirm("Delete this duty role?")) return;
    const res = await fetch(`/api/teams/${selectedTeam.id}/duty-roles/${roleId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Role deleted");
      fetchDutyRoles(selectedTeam.id);
    }
  }

  function toggleSpecialist(userId: string) {
    setRoleForm((prev) => ({
      ...prev,
      specialistUserIds: prev.specialistUserIds.includes(userId)
        ? prev.specialistUserIds.filter((id) => id !== userId)
        : [...prev.specialistUserIds, userId],
    }));
  }

  function roleDetail(role: DutyRole): string {
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

      {selectedTeam && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {selectedTeam.ageGroup} {selectedTeam.name} — Duty Roles
            </h2>
            <Button onClick={openAddRole}>Add Role</Button>
          </div>

          <div className="bg-white rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role Name</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dutyRoles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                      No duty roles defined. Add roles for this team!
                    </TableCell>
                  </TableRow>
                ) : (
                  dutyRoles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.roleName}</TableCell>
                      <TableCell>
                        <Badge variant={ROLE_TYPE_VARIANTS[role.roleType]}>
                          {ROLE_TYPE_LABELS[role.roleType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{roleDetail(role)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditRole(role)}>Edit</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteRole(role.id)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add/Edit Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoleId ? "Edit Duty Role" : "Add Duty Role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role Name *</Label>
              <Input
                value={roleForm.roleName}
                onChange={(e) => setRoleForm({ ...roleForm, roleName: e.target.value })}
                placeholder="e.g. Goal Umpire, Canteen, Photographer"
              />
            </div>

            <div className="space-y-2">
              <Label>Role Type *</Label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={roleForm.roleType}
                onChange={(e) => setRoleForm({
                  ...roleForm,
                  roleType: e.target.value as DutyRole["roleType"],
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

            {/* FIXED: user dropdown */}
            {roleForm.roleType === "FIXED" && (
              <div className="space-y-2">
                <Label>Assigned Person *</Label>
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={roleForm.assignedUserId}
                  onChange={(e) => setRoleForm({ ...roleForm, assignedUserId: e.target.value })}
                >
                  <option value="">Select a person...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
            )}

            {/* SPECIALIST: multi-select checklist */}
            {roleForm.roleType === "SPECIALIST" && (
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
                          checked={roleForm.specialistUserIds.includes(u.id)}
                          onChange={() => toggleSpecialist(u.id)}
                        />
                        <span className="text-sm">{u.name}</span>
                        <span className="text-xs text-gray-400">({u.role})</span>
                      </label>
                    ))
                  )}
                </div>
                {roleForm.specialistUserIds.length > 0 && (
                  <p className="text-xs text-gray-500">{roleForm.specialistUserIds.length} selected</p>
                )}
              </div>
            )}

            {/* FREQUENCY: weeks input */}
            {roleForm.roleType === "FREQUENCY" && (
              <div className="space-y-2">
                <Label>Fill every N weeks</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={roleForm.frequencyWeeks}
                  onChange={(e) => setRoleForm({ ...roleForm, frequencyWeeks: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  e.g. &quot;3&quot; means this role is assigned every 3rd round
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRole} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
