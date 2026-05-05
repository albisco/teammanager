"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from "@/components/ui/table";
import { useSortable, applySortable } from "@/hooks/use-sortable";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogoDropzone } from "@/components/logo-dropzone";

interface Club {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isAdultClub: boolean;
  enableAiChat: boolean;
  enablePlayHq: boolean;
  allowTeamDutyRoles: boolean;
  enforceFamilyVoteExclusion: boolean;
  maxVotesPerRound: number;
  createdAt: string;
  _count: { users: number; seasons: number; players: number };
}

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  // Club dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [dialogLogoUrl, setDialogLogoUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    isAdultClub: false,
    enableAiChat: true,
    enablePlayHq: true,
    allowTeamDutyRoles: false,
    enforceFamilyVoteExclusion: false,
    maxVotesPerRound: 4,
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  const fetchClubs = useCallback(async () => {
    try {
      const res = await fetch("/api/clubs");
      if (res.ok) setClubs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClubs(); }, [fetchClubs]);

  const { sortKey, sortDir, handleSort } = useSortable();

  const sorted = useMemo(
    () =>
      applySortable(clubs, sortKey, sortDir, (key, c) => {
        switch (key) {
          case "name": return c.name;
          case "users": return c._count.users;
          case "seasons": return c._count.seasons;
          case "players": return c._count.players;
          case "created": return c.createdAt;
          default: return null;
        }
      }),
    [clubs, sortKey, sortDir]
  );

  function openAdd() {
    setEditingClub(null);
    setForm({ name: "", slug: "", isAdultClub: false, enableAiChat: true, enablePlayHq: true, allowTeamDutyRoles: false, enforceFamilyVoteExclusion: false, maxVotesPerRound: 4, adminName: "", adminEmail: "", adminPassword: "" });
    setDialogOpen(true);
  }

  function openEdit(club: Club) {
    setEditingClub(club);
    setDialogLogoUrl(club.logoUrl);
    setForm({ name: club.name, slug: club.slug, isAdultClub: club.isAdultClub, enableAiChat: club.enableAiChat, enablePlayHq: club.enablePlayHq, allowTeamDutyRoles: club.allowTeamDutyRoles, enforceFamilyVoteExclusion: club.enforceFamilyVoteExclusion, maxVotesPerRound: club.maxVotesPerRound, adminName: "", adminEmail: "", adminPassword: "" });
    setDialogOpen(true);
  }

  function handleNameChange(name: string) {
    const slug = editingClub ? form.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm({ ...form, name, slug });
  }

  async function handleSave() {
    setLoading(true);
    try {
      if (editingClub) {
        const res = await fetch("/api/clubs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingClub.id,
            name: form.name,
            slug: form.slug,
            isAdultClub: form.isAdultClub,
            enableAiChat: form.enableAiChat,
            enablePlayHq: form.enablePlayHq,
            allowTeamDutyRoles: form.allowTeamDutyRoles,
            enforceFamilyVoteExclusion: form.enforceFamilyVoteExclusion,
            maxVotesPerRound: form.maxVotesPerRound,
          }),
        });
        if (res.ok) {
          toast.success("Club updated");
          setDialogOpen(false);
          fetchClubs();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to update");
        }
      } else {
        const res = await fetch("/api/clubs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          toast.success("Club created");
          setDialogOpen(false);
          fetchClubs();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to create");
        }
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this club and ALL its data? This cannot be undone.")) return;
    const res = await fetch("/api/clubs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success("Club deleted");
      fetchClubs();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Clubs</h1>
        <Button onClick={openAdd}>Add Club</Button>
      </div>

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Club Name</SortableTableHead>
              <TableHead className="w-36">Slug</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <SortableTableHead sortKey="users" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-24">Users</SortableTableHead>
              <SortableTableHead sortKey="seasons" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-24">Seasons</SortableTableHead>
              <SortableTableHead sortKey="players" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-24">Players</SortableTableHead>
              <SortableTableHead sortKey="created" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-36">Created</SortableTableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                  No clubs yet. Create your first club!
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((club) => (
                <TableRow key={club.id}>
                  <TableCell className="font-medium">{club.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{club.slug}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={club.isAdultClub ? "default" : "secondary"}>
                      {club.isAdultClub ? "Adult" : "Youth"}
                    </Badge>
                  </TableCell>
                  <TableCell>{club._count.users}</TableCell>
                  <TableCell>{club._count.seasons}</TableCell>
                  <TableCell>{club._count.players}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(club.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(club)}>Edit</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(club.id)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Club Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClub ? "Edit Club" : "Add Club"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Club Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Salisbury Griffins"
                />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="e.g. salisbury-griffins"
                />
              </div>
            </div>
            {editingClub && (
              <div className="space-y-2">
                <Label>Club Logo</Label>
                <LogoDropzone
                  clubId={editingClub.id}
                  clubName={form.name}
                  logoUrl={dialogLogoUrl}
                  onLogoChange={setDialogLogoUrl}
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.isAdultClub}
                onClick={() => setForm({ ...form, isAdultClub: !form.isAdultClub })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${form.isAdultClub ? "bg-primary" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.isAdultClub ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, isAdultClub: !form.isAdultClub })}>
                Adult club (player availability &amp; player voting)
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.enableAiChat}
                onClick={() => setForm({ ...form, enableAiChat: !form.enableAiChat })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${form.enableAiChat ? "bg-primary" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.enableAiChat ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, enableAiChat: !form.enableAiChat })}>
                Enable Ask AI
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.enablePlayHq}
                onClick={() => setForm({ ...form, enablePlayHq: !form.enablePlayHq })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${form.enablePlayHq ? "bg-primary" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.enablePlayHq ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, enablePlayHq: !form.enablePlayHq })}>
                Enable PlayHQ integration
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.allowTeamDutyRoles}
                onClick={() => setForm({ ...form, allowTeamDutyRoles: !form.allowTeamDutyRoles })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${form.allowTeamDutyRoles ? "bg-primary" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.allowTeamDutyRoles ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, allowTeamDutyRoles: !form.allowTeamDutyRoles })}>
                Allow teams to manage their own duty roles
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.enforceFamilyVoteExclusion}
                onClick={() => setForm({ ...form, enforceFamilyVoteExclusion: !form.enforceFamilyVoteExclusion })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${form.enforceFamilyVoteExclusion ? "bg-primary" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.enforceFamilyVoteExclusion ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, enforceFamilyVoteExclusion: !form.enforceFamilyVoteExclusion })}>
                Enforce family vote exclusion (families can&apos;t vote for their own child)
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Max Votes Per Round</Label>
              <Input
                type="number"
                min={1}
                value={form.maxVotesPerRound}
                onChange={(e) => setForm({ ...form, maxVotesPerRound: Math.max(1, Number(e.target.value) || 1) })}
              />
              <p className="text-xs text-gray-500">Voting auto-closes when a round hits this many votes.</p>
            </div>

            {!editingClub && (
              <>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Club Admin (optional)</p>
                </div>
                <div className="space-y-2">
                  <Label>Admin Name</Label>
                  <Input
                    value={form.adminName}
                    onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                    placeholder="e.g. John Smith"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Admin Email</Label>
                    <Input
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                      placeholder="admin@club.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Admin Password</Label>
                    <Input
                      type="password"
                      value={form.adminPassword}
                      onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                      placeholder="Initial password"
                    />
                  </div>
                </div>
              </>
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
