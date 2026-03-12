"use client";

import { useState, useEffect, useCallback } from "react";
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

interface Club {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  _count: { users: number; seasons: number; players: number };
}

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);

  // Club dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  const fetchClubs = useCallback(async () => {
    const res = await fetch("/api/clubs");
    if (res.ok) setClubs(await res.json());
  }, []);

  useEffect(() => { fetchClubs(); }, [fetchClubs]);

  function openAdd() {
    setEditingClub(null);
    setForm({ name: "", slug: "", adminName: "", adminEmail: "", adminPassword: "" });
    setDialogOpen(true);
  }

  function openEdit(club: Club) {
    setEditingClub(club);
    setForm({ name: club.name, slug: club.slug, adminName: "", adminEmail: "", adminPassword: "" });
    setDialogOpen(true);
  }

  function handleNameChange(name: string) {
    const slug = editingClub ? form.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm({ ...form, name, slug });
  }

  async function handleSave() {
    setLoading(true);

    if (editingClub) {
      const res = await fetch("/api/clubs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingClub.id, name: form.name, slug: form.slug }),
      });
      if (res.ok) {
        toast.success("Club updated");
        setDialogOpen(false);
        fetchClubs();
      } else {
        const data = await res.json();
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
        const data = await res.json();
        toast.error(data.error || "Failed to create");
      }
    }
    setLoading(false);
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

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club Name</TableHead>
              <TableHead className="w-36">Slug</TableHead>
              <TableHead className="w-24">Users</TableHead>
              <TableHead className="w-24">Seasons</TableHead>
              <TableHead className="w-24">Players</TableHead>
              <TableHead className="w-36">Created</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clubs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                  No clubs yet. Create your first club!
                </TableCell>
              </TableRow>
            ) : (
              clubs.map((club) => (
                <TableRow key={club.id}>
                  <TableCell className="font-medium">{club.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{club.slug}</Badge>
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
