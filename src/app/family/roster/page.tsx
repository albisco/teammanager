"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface RosterTeam {
  id: string;
  name: string;
  ageGroup: string;
}

interface RosterRound {
  id: string;
  roundNumber: number;
  date: string | null;
  gameTime: string | null;
  opponent: string | null;
  isRosterLocked: boolean;
  familyUnavailable: boolean;
}

interface RosterRole {
  id: string;
  roleName: string;
  roleType: string;
}

interface RosterData {
  teamId: string;
  teamName: string;
  ageGroup: string;
  allTeams: RosterTeam[];
  myFamilyId: string | null;
  rounds: RosterRound[];
  roles: RosterRole[];
  assignments: Record<string, Array<{ familyId: string; familyName: string; slot: number }>>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function FamilyRosterPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teamId = searchParams.get("teamId");

  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoster = useCallback(() => {
    const url = teamId ? `/api/family/roster?teamId=${teamId}` : "/api/family/roster";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    setLoading(true);
    fetchRoster();
  }, [fetchRoster]);

  function switchTeam(id: string) {
    router.push(`/family/roster?teamId=${id}`);
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Duties</h1>
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data || !data.myFamilyId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Duties</h1>
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
          No duty roster found for your teams.
        </div>
      </div>
    );
  }

  const hasAssignments = Object.keys(data.assignments).length > 0;

  // Show all past rounds + the next 3 upcoming
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastRounds = data.rounds.filter((r) => r.date && new Date(r.date) < today);
  const upcomingRounds = data.rounds.filter((r) => !r.date || new Date(r.date) >= today);
  const visibleRounds = [...pastRounds, ...upcomingRounds.slice(0, 3)];
  const hiddenCount = upcomingRounds.length - Math.min(3, upcomingRounds.length);

  // Which rounds have at least one assignment for my family?
  const myAssignedRoundIds = new Set(
    Object.entries(data.assignments)
      .filter(([, slots]) => slots.some((s) => s.familyId === data.myFamilyId))
      .map(([key]) => key.split(":")[0])
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Duties</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your assigned duties for the season. Your rounds are highlighted.
      </p>

      {/* Team switcher */}
      {data.allTeams.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {data.allTeams.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTeam(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                t.id === data.teamId
                  ? "bg-blue-900 text-white border-blue-900"
                  : "bg-card text-muted-foreground border hover:border-blue-900 hover:text-blue-900"
              }`}
            >
              {t.ageGroup} {t.name}
            </button>
          ))}
        </div>
      )}

      {data.roles.length === 0 || !hasAssignments ? (
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
          No duties have been rostered yet for this team.
        </div>
      ) : (
        <>
          {/* Mobile: card list per round */}
          <div className="md:hidden space-y-3">
            {visibleRounds.map((round) => {
              const myDuties: { roleName: string }[] = [];
              for (const role of data.roles) {
                const key = `${round.id}:${role.id}`;
                const slots = data.assignments[key] ?? [];
                if (slots.some((s) => s.familyId === data.myFamilyId)) {
                  myDuties.push({ roleName: role.roleName });
                }
              }
              const isMyRound = myDuties.length > 0;

              return (
                <div
                  key={round.id}
                  className={`bg-card border rounded-lg p-4 ${isMyRound ? "border-blue-400 ring-1 ring-blue-400" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">
                        Round {round.roundNumber}
                        {round.date && (
                          <span className="font-normal text-muted-foreground"> — {formatDate(round.date)}</span>
                        )}
                      </p>
                      {round.opponent && (
                        <p className="text-xs text-muted-foreground">vs {round.opponent}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {round.isRosterLocked && (
                        <span className="text-xs text-muted-foreground">🔒 Locked</span>
                      )}
                      {round.familyUnavailable && (
                        <Badge variant="secondary" className="text-xs">Unavailable</Badge>
                      )}
                    </div>
                  </div>
                  {myDuties.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {myDuties.map((d, i) => (
                        <Badge key={i} className="bg-blue-900 text-white text-xs">{d.roleName}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No duty this round</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: grid table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 pr-4 font-semibold text-muted-foreground uppercase text-xs tracking-wide min-w-[120px]">
                    Round
                  </th>
                  {data.roles.map((role) => (
                    <th
                      key={role.id}
                      className="text-center py-3 px-3 font-semibold text-muted-foreground uppercase text-xs tracking-wide min-w-[100px]"
                    >
                      {role.roleName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRounds.map((round) => {
                  const isMyRound = myAssignedRoundIds.has(round.id);
                  return (
                    <tr
                      key={round.id}
                      className={isMyRound ? "bg-blue-50 dark:bg-blue-950/30" : ""}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium">
                          R{round.roundNumber}
                          {round.isRosterLocked && <span className="ml-1 text-xs">🔒</span>}
                        </p>
                        {round.date && (
                          <p className="text-xs text-muted-foreground">{formatDate(round.date)}</p>
                        )}
                        {round.opponent && (
                          <p className="text-xs text-muted-foreground">vs {round.opponent}</p>
                        )}
                        {round.familyUnavailable && (
                          <Badge variant="secondary" className="text-xs mt-1">Unavailable</Badge>
                        )}
                      </td>
                      {data.roles.map((role) => {
                        const key = `${round.id}:${role.id}`;
                        const slots = data.assignments[key] ?? [];
                        const mySlots = slots.filter((s) => s.familyId === data.myFamilyId);
                        const isAssigned = mySlots.length > 0;
                        return (
                          <td key={role.id} className="text-center py-3 px-3 align-top">
                            {isAssigned ? (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-blue-900 text-white text-xs font-medium">
                                You
                              </span>
                            ) : slots.length > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {slots[0].familyName || "—"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-900" />
              Your duty
            </span>
            <span>Other names shown when someone else is assigned</span>
          </div>
          {hiddenCount > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {hiddenCount} more round{hiddenCount !== 1 ? "s" : ""} later in the season — check back as they get closer.
            </p>
          )}
        </>
      )}
    </div>
  );
}
