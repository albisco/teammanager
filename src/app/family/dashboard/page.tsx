"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PlayerAvailability {
  playerId: string;
  firstName: string;
  status: string | null;
}

interface DashboardRound {
  id: string;
  teamId: string;
  teamName: string;
  ageGroup: string;
  children: { id: string; firstName: string; surname: string }[];
  roundNumber: number;
  date: string | null;
  gameTime: string | null;
  opponent: string | null;
  venue: string | null;
  court: string | null;
  isHome: boolean | null;
  isBye: boolean;
  isRosterLocked: boolean;
  familyUnavailable: boolean;
  playerAvailabilities: PlayerAvailability[];
  duties: { roleName: string; assignedFamilyName: string | null }[];
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function groupByDate(rounds: DashboardRound[]) {
  const groups = new Map<string, DashboardRound[]>();
  for (const r of rounds) {
    const key = r.date ? new Date(r.date).toDateString() : "No date";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries());
}

function HomeAwayBadge({ isHome }: { isHome: boolean | null }) {
  if (isHome === null) return null;
  return (
    <Badge
      className={
        isHome
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs font-medium"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs font-medium"
      }
    >
      {isHome ? "Home" : "Away"}
    </Badge>
  );
}

const STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "Available", active: "bg-emerald-500 text-white", inactive: "text-muted-foreground hover:bg-muted" },
  { value: "MAYBE", label: "Maybe", active: "bg-amber-400 text-white", inactive: "text-muted-foreground hover:bg-muted" },
  { value: "UNAVAILABLE", label: "Can't make it", active: "bg-red-500 text-white", inactive: "text-muted-foreground hover:bg-muted" },
] as const;

function RoundCard({ round, onUpdate }: { round: DashboardRound; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const childNames = round.children.map((c) => c.firstName).join(", ");

  async function toggleUnavailability() {
    setBusy(true);
    try {
      const method = round.familyUnavailable ? "DELETE" : "POST";
      await fetch("/api/family/unavailability", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: round.id }),
      });
      onUpdate();
    } finally {
      setBusy(false);
    }
  }

  async function setPlayerStatus(playerId: string, status: string) {
    setBusy(true);
    try {
      await fetch("/api/family/player-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, roundId: round.id, status }),
      });
      onUpdate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Summary row */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="font-semibold text-sm">
              {round.ageGroup} {round.teamName}
              {childNames ? (
                <span className="text-muted-foreground font-normal"> — {childNames}</span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">Round {round.roundNumber}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <HomeAwayBadge isHome={round.isHome} />
            {!round.isBye && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {round.isBye ? (
          <p className="text-sm text-muted-foreground italic">Bye</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {round.opponent && (
              <span>
                <span className="text-muted-foreground">vs </span>
                <span className="font-medium">{round.opponent}</span>
              </span>
            )}
            {round.gameTime && <span className="text-muted-foreground">{round.gameTime}</span>}
            {round.venue && (
              <span className="text-muted-foreground">
                {round.venue}
                {round.court ? ` · ${round.court}` : ""}
              </span>
            )}
          </div>
        )}

        {round.duties.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
              Your Duties
            </p>
            <div className="flex flex-wrap gap-2">
              {round.duties.map((d, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {d.roleName}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Expanded availability section */}
      {expanded && !round.isBye && (
        <div className="border-t px-4 py-3 bg-muted/30 space-y-4">
          {round.isRosterLocked ? (
            <p className="text-sm text-muted-foreground">
              Duties are locked for this round. Contact your team manager if you have a conflict.
            </p>
          ) : (
            <>
              {/* Family unavailability toggle */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Round availability</p>
                  <p className="text-xs text-muted-foreground">Can your family attend this round?</p>
                </div>
                <button
                  onClick={toggleUnavailability}
                  disabled={busy}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-50 ${
                    round.familyUnavailable ? "bg-red-500" : "bg-emerald-500"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      round.familyUnavailable ? "translate-x-1" : "translate-x-6"
                    }`}
                  />
                </button>
              </div>
              {round.familyUnavailable && (
                <p className="text-xs text-red-600 dark:text-red-400 -mt-2">
                  Marked as unavailable — you won&apos;t be rostered for duties this round.
                </p>
              )}

              {/* Per-child player availability */}
              {round.playerAvailabilities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Player availability</p>
                  {round.playerAvailabilities.map((pa) => (
                    <div key={pa.playerId} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{pa.firstName}</span>
                      <div className="flex rounded-md border overflow-hidden text-xs">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            disabled={busy}
                            onClick={() => setPlayerStatus(pa.playerId, opt.value)}
                            className={`px-2.5 py-1 transition-colors disabled:opacity-50 ${
                              pa.status === opt.value ? opt.active : opt.inactive
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function FamilyDashboard() {
  const [rounds, setRounds] = useState<DashboardRound[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRounds = useCallback(() => {
    fetch("/api/family/dashboard")
      .then((r) => r.json())
      .then((data) => setRounds(data.rounds ?? []))
      .catch(() => setRounds([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/family/dashboard")
      .then((r) => r.json())
      .then((data) => setRounds(data.rounds ?? []))
      .catch(() => setRounds([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border rounded-lg p-4 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
          No upcoming fixtures in the next two weeks.
        </div>
      </div>
    );
  }

  const grouped = groupByDate(rounds);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="space-y-6">
        {grouped.map(([dateLabel, dayRounds]) => (
          <div key={dateLabel}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {dayRounds[0].date ? formatDate(dayRounds[0].date) : "No date set"}
            </h2>
            <div className="space-y-3">
              {dayRounds.map((round) => (
                <RoundCard key={round.id} round={round} onUpdate={fetchRounds} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
