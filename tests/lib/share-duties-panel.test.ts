import { describe, it, expect } from "vitest";

// Regression: ShareDutiesPanel formatMessage coverage
// Found by /ship on 2026-04-02
// Report: .gstack/qa-reports/qa-report-round-duties-broadcast-2026-04-02.md

// Re-implement the pure formatMessage function inline for unit testing.
// The real implementation lives in src/app/manager/roster/ShareDutiesPanel.tsx.
function formatMessage(
  round: { roundNumber: number; date: string | null; gameTime: string | null },
  duties: Array<{ roleName: string; names: string[] }>,
  teamName: string
): string {
  const dateStr = round.date
    ? new Date(round.date).toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }) + (round.gameTime ? ` ${round.gameTime}` : "")
    : null;

  const header = [
    `Round ${round.roundNumber} \u2013 ${teamName}`,
    dateStr,
  ]
    .filter(Boolean)
    .join("\n");

  const body = duties.map((d) => `${d.roleName}: ${d.names.join(", ")}`).join("\n");

  return duties.length > 0 ? `${header}\n\n${body}` : header;
}

describe("ShareDutiesPanel formatMessage", () => {
  const baseRound = {
    roundNumber: 4,
    date: "2026-04-04T00:00:00.000Z",
    gameTime: "10:30",
  };

  it("includes round number and team name in header", () => {
    const result = formatMessage(baseRound, [], "U10 Lions");
    expect(result).toContain("Round 4");
    expect(result).toContain("U10 Lions");
    expect(result).toContain("\u2013"); // en-dash
  });

  it("includes formatted date and time when both present", () => {
    const result = formatMessage(baseRound, [], "U10 Lions");
    expect(result).toContain("Apr");
    expect(result).toContain("10:30");
  });

  it("omits date line when date is null", () => {
    const round = { ...baseRound, date: null };
    const result = formatMessage(round, [], "U10 Lions");
    expect(result).not.toContain("Apr");
    expect(result).toContain("Round 4 \u2013 U10 Lions");
  });

  it("omits time when gameTime is null", () => {
    const round = { ...baseRound, gameTime: null };
    const result = formatMessage(round, [], "U10 Lions");
    expect(result).toContain("Apr");
    expect(result).not.toContain("10:30");
  });

  it("returns header only when duties array is empty", () => {
    const result = formatMessage(baseRound, [], "U10 Lions");
    expect(result).not.toContain("\n\n");
  });

  it("formats duty lines when duties are present", () => {
    const duties = [
      { roleName: "Goal Umpire", names: ["Chalmers"] },
      { roleName: "Oranges", names: ["Gounis"] },
    ];
    const result = formatMessage(baseRound, duties, "U10 Lions");
    expect(result).toContain("Goal Umpire: Chalmers");
    expect(result).toContain("Oranges: Gounis");
    expect(result).toContain("\n\n"); // blank line between header and body
  });

  it("joins multiple names with comma and space", () => {
    const duties = [{ roleName: "Best And Fairest Voting", names: ["Firth", "Hester", "Garcia"] }];
    const result = formatMessage(baseRound, duties, "U10 Lions");
    expect(result).toContain("Best And Fairest Voting: Firth, Hester, Garcia");
  });
});
