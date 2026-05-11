"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ExclusionRole {
  teamDutyRoleId: string;
  roleName: string;
  excluded: boolean;
}

interface TeamExclusions {
  teamId: string;
  teamName: string;
  ageGroup: string;
  roles: ExclusionRole[];
}

export default function FamilyExclusionsPage() {
  const [teams, setTeams] = useState<TeamExclusions[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchExclusions = useCallback(() => {
    fetch("/api/family/exclusions")
      .then((r) => r.json())
      .then((data) => setTeams(data.teams ?? []))
      .catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/family/exclusions")
      .then((r) => r.json())
      .then((data) => setTeams(data.teams ?? []))
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }, []);

  async function toggleExclusion(teamDutyRoleId: string, currentlyExcluded: boolean) {
    setBusy(teamDutyRoleId);
    try {
      const method = currentlyExcluded ? "DELETE" : "POST";
      const res = await fetch("/api/family/exclusions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamDutyRoleId }),
      });
      if (res.ok) {
        fetchExclusions();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update preference");
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Duty Preferences</h1>
        <p className="text-muted-foreground text-sm mb-6">Choose which duties you&apos;d prefer not to be rostered for.</p>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card border rounded-lg p-4 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Duty Preferences</h1>
        <p className="text-muted-foreground text-sm mb-6">Choose which duties you&apos;d prefer not to be rostered for.</p>
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
          No opt-outable duties have been configured for your teams yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Duty Preferences</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Turn on a duty below to request exclusion from it. Your team manager will still take this into account — it&apos;s not a guarantee.
      </p>
      <div className="space-y-6">
        {teams.map((team) => (
          <div key={team.teamId} className="bg-card border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <p className="font-semibold text-sm">
                {team.ageGroup} {team.teamName}
              </p>
            </div>
            <div className="divide-y">
              {team.roles.map((role) => (
                <div key={role.teamDutyRoleId} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{role.roleName}</span>
                    {role.excluded && (
                      <Badge variant="secondary" className="text-xs">
                        Opted out
                      </Badge>
                    )}
                  </div>
                  <button
                    disabled={busy === role.teamDutyRoleId}
                    onClick={() => toggleExclusion(role.teamDutyRoleId, role.excluded)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-50 ${
                      role.excluded ? "bg-red-500" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                    aria-label={role.excluded ? `Remove opt-out for ${role.roleName}` : `Opt out of ${role.roleName}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        role.excluded ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-6">
        Opt-outs inform your team manager&apos;s rostering decisions, but final duty assignments remain at their discretion.
      </p>
    </div>
  );
}
