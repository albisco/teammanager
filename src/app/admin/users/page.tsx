"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TeamData {
  id: string;
  name: string;
  ageGroup: string;
  manager: UserData | null;
  familyUsers: UserData[];
}

interface SeasonData {
  id: string;
  name: string;
  year: number;
  teams: TeamData[];
}

interface AllTeam {
  id: string;
  name: string;
  ageGroup: string;
  seasonName: string;
}

interface ClubData {
  id: string;
  name: string;
  slug: string;
  admins: UserData[];
  seasons: SeasonData[];
  allTeams: AllTeam[];
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  TEAM_MANAGER: "Team Manager",
  FAMILY: "Family",
  SUPER_ADMIN: "Super Admin",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ADMIN: "default",
  TEAM_MANAGER: "secondary",
  FAMILY: "outline",
  SUPER_ADMIN: "destructive",
};

const emptyForm = { name: "", email: "", password: "", role: "FAMILY", teamId: "", clubId: "" };

export default function UsersPage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as Record<string, unknown>)?.role === "SUPER_ADMIN";

  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/users/management");
    if (res.ok) {
      const data: ClubData[] = await res.json();
      setClubs(data);
      // Auto-expand all teams on first load
      const teamIds = new Set<string>();
      for (const club of data) {
        for (const season of club.seasons) {
          for (const team of season.teams) {
            teamIds.add(team.id);
          }
        }
      }
      setExpandedTeams(teamIds);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || `Failed to load users (${res.status})`);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openAdd(clubId: string) {
    setEditingUser(null);
    setForm({ ...emptyForm, clubId });
    setDialogOpen(true);
  }

  function openEdit(user: UserData, clubId: string, teamId?: string) {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      teamId: teamId || "",
      clubId,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setLoading(true);
    if (editingUser) {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("User updated");
        setDialogOpen(false);
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update");
      }
    } else {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("User created");
        setDialogOpen(false);
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create");
      }
    }
    setLoading(false);
  }

  async function handleDelete(user: UserData) {
    if (!confirm(`Delete user "${user.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("User deleted");
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to delete");
    }
  }

  function toggleTeam(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) { next.delete(teamId); } else { next.add(teamId); }
      return next;
    });
  }

  // Get allTeams for the selected club in the dialog
  const dialogClub = clubs.find((c) => c.id === form.clubId);
  const availableTeams = dialogClub?.allTeams ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Users</h1>
      </div>

      {clubs.length === 0 && (
        <p className="text-muted-foreground">No data available.</p>
      )}

      {clubs.map((club) => (
        <div key={club.id} className="mb-8">
          {isSuperAdmin && (
            <h2 className="text-xl font-semibold mb-3 text-muted-foreground">{club.name}</h2>
          )}

          {/* Club-level admins */}
          <Section
            title="Club Admins"
            users={club.admins}
            emptyText="No admins"
            onEdit={(u) => openEdit(u, club.id)}
            onDelete={handleDelete}
            onAdd={() => openAdd(club.id)}
            addLabel="Add User"
          />

          {/* Teams */}
          {club.seasons.map((season) => (
            <div key={season.id} className="mb-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {season.name} ({season.year})
              </h3>
              <div className="space-y-2">
                {season.teams.map((team) => {
                  const expanded = expandedTeams.has(team.id);
                  return (
                    <div key={team.id} className="border rounded-lg bg-card">
                      {/* Team header */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => toggleTeam(team.id)}
                      >
                        <span className="font-medium">
                          {team.ageGroup} {team.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            {(team.manager ? 1 : 0) + team.familyUsers.length} user{(team.manager ? 1 : 0) + team.familyUsers.length !== 1 ? "s" : ""}
                          </span>
                          <svg
                            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t px-4 py-3 space-y-3">
                          {/* Team Manager */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Team Manager</p>
                            {team.manager ? (
                              <UserRow
                                user={team.manager}
                                onEdit={() => openEdit(team.manager!, club.id, team.id)}
                                onDelete={() => handleDelete(team.manager!)}
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No manager assigned</p>
                            )}
                          </div>

                          {/* Family Users */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                              Family Users ({team.familyUsers.length})
                            </p>
                            {team.familyUsers.length === 0 ? (
                              <p className="text-sm text-muted-foreground italic">No family users linked</p>
                            ) : (
                              <div className="space-y-1">
                                {team.familyUsers.map((u) => (
                                  <UserRow
                                    key={u.id}
                                    user={u}
                                    onEdit={() => openEdit(u, club.id)}
                                    onDelete={() => handleDelete(u)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {club.seasons.length === 0 && (
            <p className="text-sm text-muted-foreground italic mt-2">No seasons — create a season to see teams here.</p>
          )}
        </div>
      ))}

      {/* Add/Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{editingUser ? "New Password (leave blank to keep current)" : "Password *"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingUser ? "Leave blank to keep current" : "Set a password"}
              />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value, teamId: "" })}
              >
                <option value="FAMILY">Family</option>
                <option value="TEAM_MANAGER">Team Manager</option>
                <option value="ADMIN">Admin</option>
                {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
              </Select>
            </div>
            {form.role === "TEAM_MANAGER" && availableTeams.length > 0 && (
              <div className="space-y-2">
                <Label>Assign to Team</Label>
                <Select
                  value={form.teamId}
                  onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                >
                  <option value="">— No team —</option>
                  {availableTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.ageGroup} {t.name} ({t.seasonName})
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title,
  users,
  emptyText,
  onEdit,
  onDelete,
  onAdd,
  addLabel,
}: {
  title: string;
  users: UserData[];
  emptyText: string;
  onEdit: (u: UserData) => void;
  onDelete: (u: UserData) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="border rounded-lg bg-card mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <p className="font-medium">{title}</p>
        <Button size="sm" onClick={onAdd}>{addLabel}</Button>
      </div>
      <div className="divide-y">
        {users.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground italic">{emptyText}</p>
        ) : (
          users.map((u) => (
            <UserRow key={u.id} user={u} onEdit={() => onEdit(u)} onDelete={() => onDelete(u)} />
          ))
        )}
      </div>
    </div>
  );
}

function UserRow({
  user,
  onEdit,
  onDelete,
}: {
  user: UserData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div className="min-w-0">
        <span className="font-medium text-sm">{user.name}</span>
        <span className="text-muted-foreground text-sm ml-2">{user.email}</span>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <Badge variant={ROLE_VARIANTS[user.role] ?? "outline"}>
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
        <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>Delete</Button>
      </div>
    </div>
  );
}
