"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

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
  duties: { roleName: string; assignedFamilyName: string | null }[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
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

function RoundCard({ round }: { round: DashboardRound }) {
  const childNames = round.children.map((c) => c.firstName).join(", ");

  return (
    <div className="bg-card border rounded-lg p-4">
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
        <HomeAwayBadge isHome={round.isHome} />
      </div>

      {round.isBye ? (
        <p className="text-sm text-muted-foreground italic">Bye</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-1">
            {round.opponent && (
              <span>
                <span className="text-muted-foreground">vs </span>
                <span className="font-medium">{round.opponent}</span>
              </span>
            )}
            {round.gameTime && (
              <span className="text-muted-foreground">{round.gameTime}</span>
            )}
            {round.venue && (
              <span className="text-muted-foreground">
                {round.venue}
                {round.court ? ` · ${round.court}` : ""}
              </span>
            )}
          </div>

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
        </>
      )}
    </div>
  );
}

export default function FamilyDashboard() {
  const [rounds, setRounds] = useState<DashboardRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          No upcoming fixtures. Check back closer to the season.
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
                <RoundCard key={round.id} round={round} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
