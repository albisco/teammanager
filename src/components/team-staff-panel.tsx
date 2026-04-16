"use client";

import { useCallback, useEffect, useState } from "react";
import { TeamStaffRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TEAM_STAFF_ROLE, teamStaffRoleLabel } from "@/lib/roles";

interface StaffRow {
  id: string;
  role: TeamStaffRole;
  displayName: string | null;
  user: { id: string; name: string; email: string; role: string } | null;
}

interface ClubUser {
  id: string;
  name: string;
  email: string;
}

interface Props {
  teamId: string;
  onChange?: () => void;
}

export function TeamStaffPanel({ teamId, onChange }: Props) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRole, setDialogRole] = useState<TeamStaffRole>(
    TEAM_STAFF_ROLE.HEAD_COACH as TeamStaffRole
  );
  const [mode, setMode] = useState<"pick" | "invite">("pick");
  const [clubUsers, setClubUsers] = useState<ClubUser[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [inviteForm, setInviteForm] = useState({ name: "", email: "" });
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/staff`);
    if (res.ok) setStaff(await res.json());
  }, [teamId]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const openDialog = (role: TeamStaffRole) => {
    setDialogRole(role);
    setMode("pick");
    setUserFilter("");
    setInviteForm({ name: "", email: "" });
    setLastTempPassword(null);
    setDialogOpen(true);
    // Lazy-load club users so the list is fresh.
    fetch("/api/users").then(async (r) => {
      if (r.ok) setClubUsers(await r.json());
    });
  };

  const addStaff = async (body: { userId?: string; email?: string; name?: string }) => {
    setLoading(true);
    const res = await fetch(`/api/teams/${teamId}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, role: dialogRole }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(`${teamStaffRoleLabel(dialogRole)} assigned`);
      if (data.tempPassword) {
        setLastTempPassword(data.tempPassword);
      } else {
        setDialogOpen(false);
      }
      await fetchStaff();
      onChange?.();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to assign staff");
    }
    setLoading(false);
  };

  const removeStaff = async (row: StaffRow) => {
    if (!confirm(`Remove ${row.user?.name ?? "this person"} as ${teamStaffRoleLabel(row.role)}?`)) return;
    const res = await fetch(`/api/teams/${teamId}/staff`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffRowId: row.id }),
    });
    if (res.ok) {
      toast.success("Staff removed");
      fetchStaff();
      onChange?.();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to remove");
    }
  };

  const headCoach = staff.find((s) => s.role === TEAM_STAFF_ROLE.HEAD_COACH);
  const teamManager = staff.find((s) => s.role === TEAM_STAFF_ROLE.TEAM_MANAGER);
  const assistantCoaches = staff.filter((s) => s.role === TEAM_STAFF_ROLE.ASSISTANT_COACH);

  const StaffRowDisplay = ({ row }: { row: StaffRow }) => (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{row.user?.name ?? row.displayName ?? "—"}</p>
        {row.user?.email && <p className="text-xs text-gray-500">{row.user.email}</p>}
      </div>
      <Button variant="ghost" size="sm" onClick={() => removeStaff(row)}>
        Remove
      </Button>
    </div>
  );

  const SingleSlot = ({ role, row }: { role: TeamStaffRole; row: StaffRow | undefined }) => (
    <div className="space-y-2">
      <Label>{teamStaffRoleLabel(role)}</Label>
      {row ? (
        <StaffRowDisplay row={row} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => openDialog(role)}>
          + Assign {teamStaffRoleLabel(role)}
        </Button>
      )}
    </div>
  );

  const filteredUsers = clubUsers.filter((u) => {
    if (!userFilter.trim()) return true;
    const q = userFilter.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 bg-card rounded-lg border p-4">
      <h3 className="font-semibold text-sm">Team Staff</h3>
      <SingleSlot role={TEAM_STAFF_ROLE.HEAD_COACH as TeamStaffRole} row={headCoach} />
      <SingleSlot role={TEAM_STAFF_ROLE.TEAM_MANAGER as TeamStaffRole} row={teamManager} />
      <div className="space-y-2">
        <Label>Assistant Coaches</Label>
        <div className="space-y-1">
          {assistantCoaches.map((row) => (
            <StaffRowDisplay key={row.id} row={row} />
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openDialog(TEAM_STAFF_ROLE.ASSISTANT_COACH as TeamStaffRole)}
        >
          + Add Assistant Coach
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {teamStaffRoleLabel(dialogRole)}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-1 mb-4 border-b">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 ${mode === "pick" ? "border-primary text-primary" : "border-transparent text-gray-500"}`}
              onClick={() => setMode("pick")}
            >
              Pick existing user
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 ${mode === "invite" ? "border-primary text-primary" : "border-transparent text-gray-500"}`}
              onClick={() => setMode("invite")}
            >
              Invite by email
            </button>
          </div>

          {mode === "pick" && (
            <div className="space-y-3">
              <Input
                placeholder="Search by name or email..."
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {filteredUsers.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500 text-center">
                    No users found. Try the Invite tab.
                  </p>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      onClick={() => addStaff({ userId: u.id })}
                    >
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {mode === "invite" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="e.g. Jamie Smith"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="jamie@example.com"
                />
              </div>
              {lastTempPassword && (
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-sm">
                  <p className="font-medium text-amber-900">Temporary password created</p>
                  <p className="font-mono text-amber-900 mt-1">{lastTempPassword}</p>
                  <p className="text-xs text-amber-800 mt-1">
                    Share this with them — they can change it after signing in.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {lastTempPassword ? "Done" : "Cancel"}
            </Button>
            {mode === "invite" && !lastTempPassword && (
              <Button
                onClick={() =>
                  addStaff({ email: inviteForm.email.trim(), name: inviteForm.name.trim() })
                }
                disabled={loading || !inviteForm.email.trim() || !inviteForm.name.trim()}
              >
                {loading ? "Inviting..." : "Invite & Assign"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
