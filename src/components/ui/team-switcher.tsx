"use client";

import { useEffect, useState } from "react";
import { useActiveTeam } from "@/hooks/use-active-team";
import { teamStaffRoleLabel } from "@/lib/roles";

type TeamMeta = { id: string; name: string; ageGroup: string };

/**
 * Team switcher for the manager sidebar. Only rendered when the user has >1
 * team in their session. Fetches team metadata on mount so we can show names
 * rather than raw IDs.
 */
export function TeamSwitcher() {
  const { teams, activeTeamId, activeStaffRole, setActiveTeamId, hasMultipleTeams } =
    useActiveTeam();
  const [meta, setMeta] = useState<Record<string, TeamMeta>>({});

  useEffect(() => {
    if (!hasMultipleTeams || teams.length === 0) return;
    // Fetch each team's basic info. /api/manager/team only returns the primary
    // team, so use a lightweight lookup through the staff endpoint instead.
    Promise.all(
      teams.map((t) =>
        fetch(`/api/teams/${t.teamId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => (data ? [t.teamId, data] : null))
      )
    ).then((results) => {
      const next: Record<string, TeamMeta> = {};
      for (const entry of results) {
        if (!entry) continue;
        const [id, data] = entry as [string, TeamMeta];
        next[id] = { id, name: data.name, ageGroup: data.ageGroup };
      }
      setMeta(next);
    });
  }, [hasMultipleTeams, teams]);

  if (!hasMultipleTeams || !activeTeamId) return null;

  return (
    <div className="px-4 py-3 border-b border-gray-700">
      <label className="block text-xs text-gray-400 mb-1">Active team</label>
      <select
        value={activeTeamId}
        onChange={(e) => {
          setActiveTeamId(e.target.value);
          // Full reload so server-rendered manager data refreshes.
          if (typeof window !== "undefined") window.location.reload();
        }}
        className="w-full rounded-md bg-gray-800 text-white text-sm px-2 py-1.5 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {teams.map((t) => {
          const m = meta[t.teamId];
          const label = m ? `${m.ageGroup} ${m.name}` : t.teamId.slice(0, 8);
          return (
            <option key={t.teamId} value={t.teamId}>
              {label}
            </option>
          );
        })}
      </select>
      {activeStaffRole && (
        <p className="text-xs text-gray-500 mt-1">
          You are: {teamStaffRoleLabel(activeStaffRole)}
        </p>
      )}
    </div>
  );
}
