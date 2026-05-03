"use client";

import { useEffect, useState } from "react";
import { useFamilyActiveTeam } from "@/hooks/use-family-active-team";

type TeamMeta = { id: string; name: string; ageGroup: string };

export function FamilyTeamSwitcher() {
  const { teams, activeTeamId, setActiveTeamId, hasMultipleTeams } = useFamilyActiveTeam();
  const [meta, setMeta] = useState<Record<string, TeamMeta>>({});

  useEffect(() => {
    if (!hasMultipleTeams || teams.length === 0) return;
    Promise.all(
      teams.map((teamId) =>
        fetch(`/api/teams/${teamId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => (data ? [teamId, data] : null))
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
    <div className="px-4 py-3 border-b border-blue-700">
      <label className="block text-xs text-blue-300 mb-1">Active team</label>
      <select
        value={activeTeamId}
        onChange={(e) => {
          setActiveTeamId(e.target.value);
          if (typeof window !== "undefined") window.location.reload();
        }}
        className="w-full rounded-md bg-blue-800 text-white text-sm px-2 py-1.5 border border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {teams.map((teamId) => {
          const m = meta[teamId];
          const label = m ? `${m.ageGroup} ${m.name}` : teamId.slice(0, 8);
          return (
            <option key={teamId} value={teamId}>
              {label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
