"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";

interface Player {
  id: string;
  jumperNumber: number;
  firstName: string;
  surname: string;
  dateOfBirth: string | null;
  phone: string | null;
  contactEmail: string | null;
  parent1: string | null;
  parent2: string | null;
  familyId: string | null;
  family: { id: string; name: string } | null;
}

export default function ManagerPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  function fetchPlayers() {
    fetch("/api/manager/team")
      .then((r) => r.json())
      .then((data) => {
        const sorted = (data.players || [])
          .map((tp: { player: Player }) => tp.player)
          .sort((a: Player, b: Player) => a.jumperNumber - b.jumperNumber);
        setPlayers(sorted);
        setLoading(false);
      });
  }

  useEffect(() => { fetchPlayers(); }, []);

  async function handleAutoLink() {
    setLinking(true);
    const res = await fetch("/api/manager/auto-link-families", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      if (data.created === 0 && data.linked === 0) {
        toast.info("All players already linked to families");
      } else {
        toast.success(`Created ${data.created} families, linked ${data.linked} players`);
      }
      fetchPlayers();
    } else {
      toast.error(data.error || "Failed to auto-link families");
    }
    setLinking(false);
  }

  const filtered = players.filter(
    (p) =>
      p.firstName.toLowerCase().includes(search.toLowerCase()) ||
      p.surname.toLowerCase().includes(search.toLowerCase()) ||
      String(p.jumperNumber).includes(search)
  );

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Players</h1>
        <Button onClick={handleAutoLink} disabled={linking}>
          {linking ? "Linking..." : "Auto-link Families"}
        </Button>
      </div>

      <Input
        placeholder="Search by name or jumper..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Contact Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Parent 1</TableHead>
              <TableHead>Parent 2</TableHead>
              <TableHead>Family</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                  {players.length === 0 ? "No players in this team." : "No matches found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.jumperNumber}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{p.firstName} {p.surname}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {p.dateOfBirth
                      ? new Date(p.dateOfBirth).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{p.contactEmail || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{p.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{p.parent1 || "—"}</TableCell>
                  <TableCell className="text-sm">{p.parent2 || "—"}</TableCell>
                  <TableCell>
                    {p.family ? (
                      <Badge variant="secondary" className="text-xs">{p.family.name}</Badge>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
