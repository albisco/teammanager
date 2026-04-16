"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { TeamStaffRole } from "@prisma/client";

type ManagerTeam = { teamId: string; role: TeamStaffRole };

const STORAGE_KEY = "activeTeamId";

/**
 * Hook for the manager portal: picks an active team from the user's
 * `session.user.teams` array.
 *
 * - If the user has one team, that's the active one.
 * - If the user has multiple teams, the selection is persisted to localStorage.
 * - `activeStaffRole` reflects the user's TeamStaff role on the active team
 *   (HEAD_COACH, TEAM_MANAGER, or ASSISTANT_COACH).
 */
export function useActiveTeam() {
  const { data: session, status } = useSession();
  const teams = ((session?.user as unknown as { teams?: ManagerTeam[] })?.teams ??
    []) as ManagerTeam[];

  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);

  // Resolve initial active team after session loads.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (teams.length === 0) {
      setActiveTeamIdState(null);
      return;
    }
    let stored: string | null = null;
    if (typeof window !== "undefined") {
      stored = window.localStorage.getItem(STORAGE_KEY);
    }
    const valid = stored && teams.some((t) => t.teamId === stored) ? stored : null;
    setActiveTeamIdState(valid ?? teams[0].teamId);
  }, [status, teams]);

  const setActiveTeamId = useCallback((teamId: string) => {
    setActiveTeamIdState(teamId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, teamId);
    }
  }, []);

  const activeStaffRole =
    teams.find((t) => t.teamId === activeTeamId)?.role ?? null;

  return {
    status,
    teams,
    activeTeamId,
    activeStaffRole,
    setActiveTeamId,
    hasMultipleTeams: teams.length > 1,
  };
}
