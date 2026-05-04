"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoDropzone } from "@/components/logo-dropzone";
import { toast } from "sonner";

interface Club {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export default function ClubSettingsPage() {
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClub() {
      try {
        const res = await fetch("/api/clubs");
        if (!res.ok) return;
        const clubs = await res.json();
        const c = clubs[0];
        if (c) {
          setClub(c);
          setName(c.name);
          setLogoUrl(c.logoUrl);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchClub();
  }, []);

  const handleSave = async () => {
    if (!club) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Club name cannot be empty");
      return;
    }
    if (trimmed === club.name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clubs/${club.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        return;
      }
      const updated = await res.json();
      setClub(updated);
      setName(updated.name);
      toast.success("Club name updated");
    } catch {
      toast.error("Failed to save — check your connection");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Club Settings</h1>
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Club Settings</h1>
        <p className="text-muted-foreground">Club not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Club Settings</h1>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="club-name">Club Name</Label>
          <Input
            id="club-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter club name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="club-slug">Slug</Label>
          <Input
            id="club-slug"
            value={club.slug}
            disabled
            className="opacity-60"
          />
          <p className="text-xs text-muted-foreground">
            Slug can only be changed by a super admin.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Club Logo</Label>
          <LogoDropzone
            clubId={club.id}
            clubName={name || club.name}
            logoUrl={logoUrl}
            onLogoChange={setLogoUrl}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || name.trim() === club.name || !name.trim()}
        >
          {saving ? "Saving…" : "Save Changes"}
        </Button>
        <p className="text-xs text-muted-foreground -mt-4">
          Logo changes save automatically when you upload or remove.
        </p>
      </div>
    </div>
  );
}
