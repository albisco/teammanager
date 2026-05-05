"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "familyActiveTeamId";

export function useFamilyActiveTeam() {
  const { data: session, status } = useSession();
  const teams = useMemo(
    () => ((session?.user as unknown as { familyTeams?: string[] })?.familyTeams ?? []) as string[],
    [session?.user]
  );

  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);

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
    const valid = stored && teams.includes(stored) ? stored : null;
    setActiveTeamIdState(valid ?? teams[0]);
  }, [status, teams]);

  const setActiveTeamId = useCallback((teamId: string) => {
    setActiveTeamIdState(teamId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, teamId);
    }
  }, []);

  return {
    status,
    teams,
    activeTeamId,
    setActiveTeamId,
    hasMultipleTeams: teams.length > 1,
  };
}
