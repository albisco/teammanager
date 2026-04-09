"use client";

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";

const ROLES = ["Coach", "Assistant Coach", "Team Manager"];

interface StaffEntry {
  role: string;
  name: string;
}

export default function VolunteersPage() {
  const [parentNames, setParentNames] = useState<string[]>([]);
  // Map of role -> selected value in dropdown ("" | name | "Other")
  const [selections, setSelections] = useState<Record<string, string>>({});
  // Map of role -> free-text when "Other" is chosen
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/manager/volunteers");
    if (!res.ok) return;
    const data: { staff: StaffEntry[]; parentNames: string[] } = await res.json();
    setParentNames(data.parentNames);

    // Pre-populate selections from saved staff
    const sel: Record<string, string> = {};
    const other: Record<string, string> = {};
    for (const entry of data.staff) {
      if (data.parentNames.includes(entry.name)) {
        sel[entry.role] = entry.name;
      } else {
        sel[entry.role] = "Other";
        other[entry.role] = entry.name;
      }
    }
    setSelections(sel);
    setOtherText(other);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave(role: string) {
    const selected = selections[role] ?? "";
    const name = selected === "Other" ? (otherText[role] ?? "").trim() : selected;

    setSaving((s) => ({ ...s, [role]: true }));
    const res = await fetch("/api/manager/volunteers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name }),
    });
    if (res.ok) {
      toast.success(`${role} saved`);
    } else {
      toast.error("Failed to save");
    }
    setSaving((s) => ({ ...s, [role]: false }));
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-3xl font-bold mb-2">Volunteers</h1>
      <p className="text-muted-foreground mb-8">Assign key roles for the season.</p>

      <div className="space-y-6">
        {ROLES.map((role) => {
          const selected = selections[role] ?? "";
          const isOther = selected === "Other";

          return (
            <div key={role} className="bg-card border rounded-lg p-4 space-y-3">
              <Label className="text-base font-medium">{role}</Label>

              <Select
                value={selected}
                onChange={(e) => {
                  setSelections((s) => ({ ...s, [role]: e.target.value }));
                  if (e.target.value !== "Other") {
                    setOtherText((o) => ({ ...o, [role]: "" }));
                  }
                }}
              >
                <option value="">— Not assigned —</option>
                {parentNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value="Other">Other (enter name)</option>
              </Select>

              {isOther && (
                <Input
                  placeholder="Enter name..."
                  value={otherText[role] ?? ""}
                  onChange={(e) => setOtherText((o) => ({ ...o, [role]: e.target.value }))}
                />
              )}

              <Button
                size="sm"
                disabled={saving[role]}
                onClick={() => handleSave(role)}
              >
                {saving[role] ? "Saving..." : "Save"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
