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
import QRCode from "qrcode";
import Image from "next/image";
import ShareDutiesPanel from "./ShareDutiesPanel";
import type { TeamStaffRoleName } from "@/lib/roles";

interface GlobalDutyRole {
  id: string;
  roleName: string;
  teamId?: string | null;
}

interface SpecialistEntry {
  id: string;
  personName: string;
  familyId: string | null;
}

interface FamilyMember {
  familyId: string;
  personName: string;
  label: string;
}

interface TeamRoleConfig {
  dutyRoleId: string;
  roleName: string;
  isTeamScoped?: boolean;
  teamDutyRoleId: string | null;
  roleType: "FIXED" | "SPECIALIST" | "ROTATING" | "FREQUENCY";
  assignedPersonName: string | null;
  assignedFamilyId: string | null;
  frequencyWeeks: number;
  slots: number;
  specialists: SpecialistEntry[];
  configured: boolean;
  autoFromTeamStaff?: boolean;
  teamStaffRole?: TeamStaffRoleName | null;
}

interface RosterRound {
  id: string;
  roundNumber: number;
  isBye: boolean;
  date: string | null;
  gameTime: string | null;
  isRosterLocked: boolean;
}

interface RosterRole {
  id: string;
  roleName: string;
  roleType: string;
  slots: number;
  sortOrder?: number;
  isStaffRole?: boolean;
  assignedName?: string;
}

interface RosterFamily {
  id: string;
  name: string;
}

interface RosterData {
  rounds: RosterRound[];
  roles: RosterRole[];
  staffRoles?: Array<{ id: string; roleName: string; roleType: string; slots: number; assignedName: string | null; sortOrder?: number }>;
  allRoles?: Array<{ id: string; roleName: string; roleType: string; slots: number; sortOrder?: number; isStaffRole: boolean; assignedName?: string }>;
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

interface SpecialistFormEntry {
  personName: string;
  familyId: string | null;
}

export default function ManagerRosterPage() {
  const { data: session } = useSession();
  const user = session?.user as Record<string, unknown> | undefined;
  const teamId = user?.teamId as string | null;
  const rosterEnabled = user?.teamEnableRoster !== false;
  const allowTeamDutyRoles = user?.allowTeamDutyRoles === true;

  const [teamRoles, setTeamRoles] = useState<TeamRoleConfig[]>([]);
  const [globalRoles, setGlobalRoles] = useState<GlobalDutyRole[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
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
    assignedPersonName: "",
    assignedFamilyId: "" as string | null,
    frequencyWeeks: "1",
    slots: "1",
    specialists: [] as SpecialistFormEntry[],
  });
  const [customSpecialistName, setCustomSpecialistName] = useState("");

  // Override dialog
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideCell, setOverrideCell] = useState<{ roundId: string; roleId: string; roleName: string; roundNumber: number; slot: number } | null>(null);
  const [overrideFamilyId, setOverrideFamilyId] = useState("");
  const [overridePersonName, setOverridePersonName] = useState("");

  // Drag-and-drop for roster cells
  const [dragSource, setDragSource] = useState<{ roundId: string; roleId: string; slot: number; familyId: string } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // Drag-and-drop for role reordering
  const [roleDragIndex, setRoleDragIndex] = useState<number | null>(null);
  const [roleDragOverIndex, setRoleDragOverIndex] = useState<number | null>(null);

  // Share duties
  const [teamName, setTeamName] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  // Availability QR dialog
  const [availabilityToken, setAvailabilityToken] = useState<string | null>(null);
  const [availQrDialogOpen, setAvailQrDialogOpen] = useState(false);
  const [availQrDataUrl, setAvailQrDataUrl] = useState("");
  const [availQrLink, setAvailQrLink] = useState("");

  // Single fetch for all page data
  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/manager/roster");
    if (!res.ok) return;
    const data = await res.json();
    setGlobalRoles(data.globalRoles);
    setTeamRoles(data.teamRoles);
    setFamilyMembers(data.familyMembers || []);
    setRosterData(data.roster);
    setTeamName(data.teamName ?? "");
    setAvailabilityToken(data.availabilityToken ?? null);
    setUnavailabilities(new Set(data.unavailabilities.map((u: { familyId: string; roundId: string }) => `${u.familyId}:${u.roundId}`)));
    // Auto-select next upcoming round for duties panel
    const now = new Date();
    const upcoming = (data.roster.rounds as RosterRound[])
      .filter((r) => !r.isBye && r.date && new Date(r.date) >= now)
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
    const autoRound = upcoming[0] ?? data.roster.rounds.filter((r: RosterRound) => !r.isBye).slice(-1)[0] ?? null;
    setSelectedRoundId(autoRound?.id ?? null);
    setPageLoading(false);
  }, []);

  // Lightweight refreshes after mutations
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

  // === Role Reordering ===
  async function handleRoleDrop(targetIndex: number) {
    if (roleDragIndex === null || roleDragIndex === targetIndex) {
      setRoleDragIndex(null);
      setRoleDragOverIndex(null);
      return;
    }

    const newRoles = [...globalRoles];
    const [moved] = newRoles.splice(roleDragIndex, 1);
    newRoles.splice(targetIndex, 0, moved);

    setGlobalRoles(newRoles);
    setRoleDragIndex(null);
    setRoleDragOverIndex(null);

    const res = await fetch("/api/duty-roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: newRoles.map((r) => r.id) }),
    });

    if (!res.ok) {
      toast.error("Failed to update order");
    }
    // Always refetch full page data so exclusions + team-scoped roles stay correct.
    fetchAll();
  }

  // === Club Role CRUD ===
  function openAddClubRole() {
    setClubRoleName("");
    setClubRoleDialogOpen(true);
  }

  async function handleSaveClubRole() {
    if (!teamId) return;
    setLoading(true);
    const res = await fetch(`/api/teams/${teamId}/duty-roles/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleName: clubRoleName }),
    });

    if (res.ok) {
      toast.success("Team role created");
      setClubRoleDialogOpen(false);
      fetchAll();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  async function handleDeleteTeamScopedRole(role: TeamRoleConfig) {
    if (!teamId) return;
    if (!confirm(`Delete team role "${role.roleName}"? All team configuration and roster assignments for this role will be removed.`)) return;
    const res = await fetch(`/api/teams/${teamId}/duty-roles/custom/${role.dutyRoleId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Role deleted");
      fetchAll();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to delete");
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
    if (!teamId || !configRole) return;
    setLoading(true);

    const res = await fetch(`/api/teams/${teamId}/duty-roles`, {
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
      fetchTeamRoles();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to save");
    }
    setLoading(false);
  }

  function toggleFamilyMemberSpecialist(fm: FamilyMember) {
    setConfigForm((prev) => {
      const exists = prev.specialists.some((s) => s.personName === fm.personName && s.familyId === fm.familyId);
      return {
        ...prev,
        specialists: exists
          ? prev.specialists.filter((s) => !(s.personName === fm.personName && s.familyId === fm.familyId))
          : [...prev.specialists, { personName: fm.personName, familyId: fm.familyId }],
      };
    });
  }

  function addCustomSpecialist() {
    const name = customSpecialistName.trim();
    if (!name) return;
    if (configForm.specialists.some((s) => s.personName === name && !s.familyId)) return;
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

  function selectFixedPerson(value: string) {
    if (value === "__custom__") {
      setConfigForm((prev) => ({ ...prev, assignedPersonName: "", assignedFamilyId: null }));
    } else {
      const fm = familyMembers.find((m) => `${m.familyId}:${m.personName}` === value);
      if (fm) {
        setConfigForm((prev) => ({ ...prev, assignedPersonName: fm.personName, assignedFamilyId: fm.familyId }));
      }
    }
  }

  function specialistLabel(s: SpecialistFormEntry): string {
    if (s.familyId) {
      const fm = familyMembers.find((m) => m.familyId === s.familyId && m.personName === s.personName);
      return fm?.label || s.personName;
    }
    return s.personName;
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

  // Remove club-level role from this team (does not affect club definition)
  async function handleExcludeClubRole(role: TeamRoleConfig) {
    if (!teamId) return;
    if (!confirm(`Remove "${role.roleName}" from this team's roster?\n\nThis only affects your team — the club-level role definition is unchanged. You can ask your club admin to restore it if needed.`)) return;

    const res = await fetch(`/api/teams/${teamId}/duty-roles/exclude/${role.dutyRoleId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${role.roleName} removed from team roster`);
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Failed to remove role");
    }
  }

  // === Roster Generation ===
  async function handleDeleteRole(role: TeamRoleConfig) {
    if (!teamId || !role.teamDutyRoleId) return;
    if (!confirm(`Reset configuration for "${role.roleName}"? This clears the current setup but keeps the role in your roster.`)) return;

    const res = await fetch(`/api/teams/${teamId}/duty-roles/${role.teamDutyRoleId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${role.roleName} configuration reset`);
      fetchAll();
    } else {
      toast.error("Failed to reset role");
    }
  }

  async function handleToggleLock(round: RosterRound) {
    const newLocked = !round.isRosterLocked;
    const res = await fetch(`/api/rounds/${round.id}/lock`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: newLocked }),
    });
    if (res.ok) {
      toast.success(newLocked ? `Round ${round.roundNumber} locked` : `Round ${round.roundNumber} unlocked`);
      fetchRosterData();
    } else {
      toast.error("Failed to update lock");
    }
  }

  async function handleGenerate() {
    if (!teamId) return;
    if (!confirm("This will overwrite roster assignments for unlocked rounds. Locked rounds will be preserved. Continue?")) return;

    setGenerating(true);
    const res = await fetch(`/api/teams/${teamId}/roster/generate`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const lockedNote = data.skippedLockedRounds > 0 ? `, ${data.skippedLockedRounds} locked round${data.skippedLockedRounds !== 1 ? "s" : ""} preserved` : "";
      toast.success(`Roster generated — ${data.count} assignments created${lockedNote}`);
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
    // Try to resolve person name for pre-selection in person-role dropdowns
    const role = teamRoles.find((r) => r.teamDutyRoleId === roleId);
    if (slotData?.familyId && (role?.roleType === "SPECIALIST" || role?.roleType === "FIXED")) {
      const fm = familyMembers.find((m) => m.familyId === slotData.familyId);
      setOverridePersonName(fm?.personName || "");
    } else {
      setOverridePersonName("");
    }
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
        assignedFamilyName: overrideFamilyId
          ? (overridePersonName
            ? overridePersonName
            : resolveAssignName(overrideCell.roleId, overrideFamilyId))
          : null,
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

  // === Drag-and-drop swap ===
  async function handleDrop(targetRoundId: string, targetRoleId: string, targetSlot: number, targetFamilyId: string | null) {
    if (!dragSource || !teamId) return;
    if (dragSource.roundId === targetRoundId && dragSource.slot === targetSlot) return;

    setDragSource(null);
    setDragOverKey(null);

    const assign = (roundId: string, slot: number, familyId: string | null) => {
      return fetch(`/api/teams/${teamId}/roster/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, teamDutyRoleId: targetRoleId, assignedFamilyId: familyId, assignedFamilyName: familyId ? resolveAssignName(targetRoleId, familyId) : null, slot }),
      });
    };

    const [r1, r2] = await Promise.all([
      assign(dragSource.roundId, dragSource.slot, targetFamilyId),
      assign(targetRoundId, targetSlot, dragSource.familyId),
    ]);

    if (r1.ok && r2.ok) {
      toast.success("Assignments swapped");
      fetchRosterData();
    } else {
      toast.error("Swap failed");
    }
  }

  async function showAvailQR() {
    if (!availabilityToken) return;
    const link = `${window.location.origin}/availability/${availabilityToken}`;
    setAvailQrLink(link);
    const dataUrl = await QRCode.toDataURL(link, { width: 300, margin: 2 });
    setAvailQrDataUrl(dataUrl);
    setAvailQrDialogOpen(true);
  }

  function getDutiesForRound(roundId: string) {
    if (!rosterData) return [];
    // Use combined allRoles from API (already sorted by sortOrder)
    return (rosterData.allRoles ?? [])
      .map((role) => {
        // Staff roles have assignedName directly, team roles need assignment lookup
        if (role.isStaffRole && role.assignedName) {
          return { roleName: role.roleName, names: [role.assignedName] };
        }
        const key = `${roundId}:${role.id}`;
        const assignments = rosterData.assignments[key] ?? [];
        return { roleName: role.roleName, names: assignments.map((a) => resolveAssignName(role.id, a.familyId)) };
      })
      .filter((d) => d.names.length > 0);
  }

  const activeRounds = rosterData?.rounds.filter((r) => !r.isBye) || [];
  const hasAssignments = rosterData && Object.keys(rosterData.assignments).length > 0;

  // Count conflicts: assignments where the family is marked unavailable
  const conflictCount = rosterData ? Object.entries(rosterData.assignments).reduce((count, [key, slots]) => {
    const roundId = key.split(":")[0];
    return count + slots.filter((a) => unavailabilities.has(`${a.familyId}:${roundId}`)).length;
  }, 0) : 0;

  // For the fixed role dropdown, determine current selection key
  const fixedDropdownValue = configForm.assignedFamilyId && configForm.assignedPersonName
    ? `${configForm.assignedFamilyId}:${configForm.assignedPersonName}`
    : configForm.assignedPersonName && !configForm.assignedFamilyId
      ? "__custom__"
      : "";

  if (!rosterEnabled) return <p className="text-gray-500">Duty roster is disabled for this team.</p>;
  if (pageLoading) return <p className="text-gray-500">Loading...</p>;

  // Combine and sort roles for display (team roles + staff roles sorted by sortOrder)
  const displayRoles = rosterData?.allRoles ?? rosterData?.roles ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Duty Roster</h1>

      {/* Share duties panel */}
      {rosterData && selectedRoundId && (() => {
        const round = rosterData.rounds.find((r) => r.id === selectedRoundId);
        if (!round) return null;
        return (
          <ShareDutiesPanel
            round={round}
            duties={getDutiesForRound(selectedRoundId)}
            teamName={teamName}
            rounds={rosterData.rounds}
            onRoundChange={setSelectedRoundId}
          />
        );
      })()}

      {/* Club Roles Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Duty Roles</h2>
          {allowTeamDutyRoles && (
            <Button onClick={openAddClubRole}>Add Team Role</Button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Club roles apply to every team. {allowTeamDutyRoles
            ? "Add team-specific roles for anything unique to your team."
            : "Configure how your team fills each one below."}
        </p>
        <div className="flex gap-2 flex-wrap">
          {globalRoles.length === 0 ? (
            <p className="text-gray-500">No roles defined yet. Add your first role above.</p>
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
                <Badge variant={role.teamId ? "secondary" : "outline"} className="px-3 py-1.5 text-sm cursor-default">
                  {role.roleName}{role.teamId ? " · Team" : ""}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Team role configuration */}
      {teamRoles.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mb-4">Role Configuration</h2>
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
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {role.roleName}
                        {role.isTeamScoped && (
                          <Badge variant="secondary" className="text-[10px] uppercase">Team</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_TYPE_VARIANTS[role.roleType]}>
                        {ROLE_TYPE_LABELS[role.roleType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{roleDetail(role)}</TableCell>
                    <TableCell>
                      {role.autoFromTeamStaff ? (
                        <Badge className="bg-blue-600">From Team Staff</Badge>
                      ) : role.configured ? (
                        <Badge className="bg-green-600">Configured</Badge>
                      ) : (
                        <Badge variant="outline">Default</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {role.autoFromTeamStaff ? (
                        <span className="text-xs text-gray-500">Manage via Team Staff</span>
                      ) : (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => openConfigDialog(role)}>
                            Configure
                          </Button>
                          {role.configured && !role.isTeamScoped && (
                            <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-800 hover:bg-amber-50" onClick={() => handleDeleteRole(role)}>
                              Reset
                            </Button>
                          )}
                          {!role.isTeamScoped && (
                            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleExcludeClubRole(role)}>
                              Delete
                            </Button>
                          )}
                          {role.isTeamScoped && allowTeamDutyRoles && (
                            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteTeamScopedRole(role)}>
                              Delete
                            </Button>
                          )}
                        </div>
                      )}
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
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h2 className="text-xl font-semibold">Family Unavailability</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!showUnavailability) fetchAll();
                setShowUnavailability(!showUnavailability);
              }}
            >
              {showUnavailability ? "Hide" : "Show"}
            </Button>
            {availabilityToken && (
              <Button variant="outline" size="sm" onClick={showAvailQR}>
                Share availability form
              </Button>
            )}
          </div>

          {showUnavailability && (
            <div className="bg-card rounded-lg border overflow-x-auto mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10 min-w-[150px]">Family</TableHead>
                    {activeRounds.map((r) => (
                      <TableHead key={r.id} className="text-center min-w-[70px]">
                        <div>R{r.roundNumber}</div>
                        {r.date && (
                          <div className="text-xs font-normal text-gray-400">
                            {new Date(r.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                          </div>
                        )}
                        {r.gameTime && (
                          <div className="text-xs font-normal text-gray-400">{r.gameTime}</div>
                        )}
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
                        const isLocked = round.isRosterLocked;
                        return (
                          <TableCell key={round.id} className="text-center">
                            <input
                              type="checkbox"
                              className={`rounded border-gray-300 ${isLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                              checked={isUnavailable}
                              disabled={isLocked}
                              onChange={() => !isLocked && toggleUnavailability(family.id, round.id)}
                              title={isLocked ? "Round is locked" : isUnavailable ? "Mark available" : "Mark unavailable"}
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
              {conflictCount > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  ⚠ {conflictCount} conflict{conflictCount !== 1 ? "s" : ""} — family unavailable
                </span>
              )}
            </p>
          )}
          {rosterData && rosterData.families.length === 0 && (
            <p className="text-sm text-amber-600">
              No players found on this team. Add players to the team first.
            </p>
          )}
        </div>
      )}

      {/* Roster Grid - sort roles by sortOrder to match Admin → Roster */}
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
                      <div className="flex items-center justify-center gap-1">
                        <span>R{r.roundNumber}</span>
                        <button
                          onClick={() => handleToggleLock(r)}
                          title={r.isRosterLocked ? "Unlock round" : "Lock round"}
                          className="text-gray-400 hover:text-gray-700 leading-none"
                        >
                          {r.isRosterLocked ? "🔒" : "🔓"}
                        </button>
                      </div>
                      {r.date && (
                        <div className="text-xs font-normal text-gray-400">
                          {new Date(r.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </div>
                      )}
                      {r.gameTime && (
                        <div className="text-xs font-normal text-gray-400">{r.gameTime}</div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRoles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="sticky left-0 bg-card z-10 font-medium">
                      <div className="flex items-center gap-2">
                        {role.roleName}
                        {role.isStaffRole ? (
                          <Badge variant="default" className="text-xs">From Staff</Badge>
                        ) : (
                          <Badge variant={ROLE_TYPE_VARIANTS[role.roleType] || "outline"} className="text-xs">
                            {ROLE_TYPE_LABELS[role.roleType] || role.roleType}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {activeRounds.map((round) => {
                      // Staff roles show the assigned name directly (same for all rounds)
                      if (role.isStaffRole && role.assignedName) {
                        const isLocked = round.isRosterLocked;
                        return (
                          <TableCell key={round.id} className="text-center text-sm align-top py-2">
                            <div className="flex flex-col gap-0.5">
                              <div className={`rounded px-1 ${isLocked ? "text-gray-500" : ""}`}>
                                {role.assignedName}
                              </div>
                              {!isLocked && (
                                <button
                                  onClick={() => openOverrideDialog(round.id, role.id, role.roleName, round.roundNumber, 0)}
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  Override
                                </button>
                              )}
                            </div>
                          </TableCell>
                        );
                      }
                      const slotAssignments = rosterData.assignments[`${round.id}:${role.id}`] || [];
                      const totalSlots = role.slots ?? 1;
                      const isLocked = round.isRosterLocked;
                      return (
                        <TableCell key={round.id} className={`text-center text-sm align-top py-2${isLocked ? " bg-gray-50" : ""}`}>
                          <div className="flex flex-col gap-0.5">
                            {Array.from({ length: totalSlots }).map((_, slot) => {
                              const a = slotAssignments.find((x) => x.slot === slot);
                              const dropKey = `${round.id}:${role.id}:${slot}`;
                              const isDropTarget = !isLocked && dragOverKey === dropKey && dragSource?.roleId === role.id;
                              const isDragging = dragSource?.roundId === round.id && dragSource?.roleId === role.id && dragSource?.slot === slot;
                              const hasConflict = a && unavailabilities.has(`${a.familyId}:${round.id}`);
                              return (
                                <div
                                  key={slot}
                                  draggable={!isLocked && !!a}
                                  title={isLocked ? "Round is locked" : hasConflict ? `${resolveAssignName(role.id, a.familyId)} is unavailable for this round` : undefined}
                                  className={[
                                    "rounded px-1 select-none",
                                    isLocked ? "cursor-default text-gray-500" : "cursor-pointer hover:bg-blue-50",
                                    isDropTarget ? "ring-2 ring-blue-400 bg-blue-100" : "",
                                    isDragging ? "opacity-40" : "",
                                    !isLocked && hasConflict ? "bg-red-100 text-red-700 ring-1 ring-red-300" : "",
                                  ].join(" ")}
                                  onDragStart={() => !isLocked && a && setDragSource({ roundId: round.id, roleId: role.id, slot, familyId: a.familyId })}
                                  onDragEnd={() => { setDragSource(null); setDragOverKey(null); }}
                                  onDragOver={(e) => { if (!isLocked && dragSource?.roleId === role.id) { e.preventDefault(); setDragOverKey(dropKey); } }}
                                  onDragLeave={() => setDragOverKey(null)}
                                  onDrop={() => !isLocked && handleDrop(round.id, role.id, slot, a?.familyId ?? null)}
                                  onClick={() => { if (!isLocked && !dragSource) openOverrideDialog(round.id, role.id, role.roleName, round.roundNumber, slot); }}
                                >
                                  {a ? (
                                    <>
                                      {!isLocked && hasConflict && <span className="mr-0.5">⚠</span>}
                                      {resolveAssignName(role.id, a.familyId)}
                                    </>
                                  ) : <span className="text-gray-300">—</span>}
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
          <p className="text-xs text-gray-400 mt-2">Click a cell to reassign. Drag a name to swap with another round. Click 🔓 on a round to lock it — locked rounds are preserved during regeneration.</p>
        </div>
      )}

      {/* Duty Counts Summary */}
      {hasAssignments && rosterData && rosterData.families.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Duty Tally</h2>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[150px]">Family</TableHead>
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
                  const total = rotatingRoles.reduce((sum, role) => sum + (counts[role.id] || 0), 0);
                  return (
                    <TableRow key={family.id}>
                      <TableCell className="sticky left-0 bg-card z-10 font-medium">{family.name}</TableCell>
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
            <DialogTitle>Add Team Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role Name *</Label>
              <Input
                value={clubRoleName}
                onChange={(e) => setClubRoleName(e.target.value)}
                placeholder="e.g. Boundary Umpire, Timekeeper"
              />
              <p className="text-xs text-gray-500">This role will only appear for your team.</p>
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
                  value={fixedDropdownValue}
                  onChange={(e) => selectFixedPerson(e.target.value)}
                >
                  <option value="">Select a person...</option>
                  {familyMembers.map((fm) => (
                    <option key={`${fm.familyId}:${fm.personName}`} value={`${fm.familyId}:${fm.personName}`}>
                      {fm.label}
                    </option>
                  ))}
                  <option value="__custom__">Other (type a name)...</option>
                </select>
                {(fixedDropdownValue === "__custom__" || (configForm.assignedPersonName && !configForm.assignedFamilyId)) && (
                  <Input
                    placeholder="Type person's name"
                    value={configForm.assignedPersonName}
                    onChange={(e) => setConfigForm({ ...configForm, assignedPersonName: e.target.value, assignedFamilyId: null })}
                  />
                )}
              </div>
            )}

            {configForm.roleType === "SPECIALIST" && (
              <div className="space-y-2">
                <Label>Eligible Specialists *</Label>
                {/* Selected specialists as badges */}
                {configForm.specialists.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {configForm.specialists.map((s, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                        {specialistLabel(s)}
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
                {/* Family member checkboxes */}
                <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
                  {familyMembers.length === 0 ? (
                    <p className="text-sm text-gray-500 p-2">No family members found. Add players with parent names first.</p>
                  ) : (
                    familyMembers.map((fm) => {
                      const isSelected = configForm.specialists.some((s) => s.personName === fm.personName && s.familyId === fm.familyId);
                      return (
                        <label key={`${fm.familyId}:${fm.personName}`} className="flex items-center gap-2 px-2 py-1 hover:bg-muted rounded cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={isSelected}
                            onChange={() => toggleFamilyMemberSpecialist(fm)}
                          />
                          <span className="text-sm">{fm.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                {/* Add external person */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add other person (e.g. Uncle Dave)"
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
              {overrideCell?.roleName}{overrideCell && overrideCell.slot > 0 ? ` (slot ${overrideCell.slot + 1})` : ""} — Round {overrideCell?.roundNumber}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const overrideRole = overrideCell ? teamRoles.find((r) => r.teamDutyRoleId === overrideCell.roleId) : null;
            const isPersonRole = overrideRole?.roleType === "SPECIALIST" || overrideRole?.roleType === "FIXED";
            return (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{isPersonRole ? "Assign to Person" : "Assign to Family"}</Label>
                  {isPersonRole ? (
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={overrideFamilyId ? `${overrideFamilyId}:${overridePersonName}` : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) { setOverrideFamilyId(""); setOverridePersonName(""); return; }
                        const sep = val.indexOf(":");
                        setOverrideFamilyId(val.substring(0, sep));
                        setOverridePersonName(val.substring(sep + 1));
                      }}
                    >
                      <option value="">— Unassigned —</option>
                      {familyMembers.map((fm) => (
                        <option key={`${fm.familyId}:${fm.personName}`} value={`${fm.familyId}:${fm.personName}`}>
                          {fm.personName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={overrideFamilyId}
                      onChange={(e) => { setOverrideFamilyId(e.target.value); setOverridePersonName(""); }}
                    >
                      <option value="">— Unassigned —</option>
                      {rosterData?.families.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleOverride} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Availability QR Dialog */}
      <Dialog open={availQrDialogOpen} onOpenChange={setAvailQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Family Availability Form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-gray-600">
              Share this link with families. They can mark which rounds they can&apos;t attend.
            </p>
            {availQrDataUrl && (
              <Image src={availQrDataUrl} alt="QR code" width={300} height={300} className="mx-auto rounded-lg" />
            )}
            <div className="flex gap-2">
              <input
                readOnly
                value={availQrLink}
                className="flex-1 rounded-md border px-3 py-2 text-sm bg-muted"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigator.clipboard.writeText(availQrLink); toast.success("Link copied"); }}
              >
                Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
