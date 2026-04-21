import { describe, it, expect } from "vitest";
import { parseIcs, mapEventsForTeam } from "../../src/lib/ics-parser";

const REV_SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:spatie/icalendar-generator
BEGIN:VEVENT
UID:40db6d3079bfe8988d56e305d2da94d6-drawrevolutionise.com.au
DTSTAMP:20260414T214000Z
SUMMARY:2026 Winter - Maroondah Volleyball League Tuesday - Division 1 - Wi
 nter 2026 Round 1 - Hustlers vs Volleybros
DESCRIPTION:See https://www.revolutionise.com.au/maroondahvolleyball for mo
 re.
LOCATION:Maroondah Nets - Court V2
URL:https://www.revolutionise.com.au/maroondahvolleyball
DTSTART;TZID=Australia/Melbourne:20260414T214000
DTEND;TZID=Australia/Melbourne:20260414T224000
END:VEVENT
BEGIN:VEVENT
UID:444005a532df136b8702158d2f3ac1bd-drawrevolutionise.com.au
DTSTAMP:20260421T203000Z
SUMMARY:2026 Winter - Maroondah Volleyball League Tuesday - Division 1 - Wi
 nter 2026 Round 2 - Hustlers vs Dizzy Dove
DESCRIPTION:See https://www.revolutionise.com.au/maroondahvolleyball for mo
 re.
LOCATION:Maroondah Nets - Court V6
URL:https://www.revolutionise.com.au/maroondahvolleyball
DTSTART;TZID=Australia/Melbourne:20260421T203000
DTEND;TZID=Australia/Melbourne:20260421T213000
END:VEVENT
END:VCALENDAR
`;

describe("parseIcs (Revolutionise fixture)", () => {
  it("unfolds continuation lines and extracts all VEVENTs", () => {
    const events = parseIcs(REV_SAMPLE);
    expect(events).toHaveLength(2);
    expect(events[0].uid).toBe("40db6d3079bfe8988d56e305d2da94d6-drawrevolutionise.com.au");
    expect(events[0].summary).toContain("Round 1 - Hustlers vs Volleybros");
  });

  it("extracts round number, teams, venue, and court", () => {
    const [ev1, ev2] = parseIcs(REV_SAMPLE);
    expect(ev1.roundNumber).toBe(1);
    expect(ev1.teamA).toBe("Hustlers");
    expect(ev1.teamB).toBe("Volleybros");
    expect(ev1.venue).toBe("Maroondah Nets");
    expect(ev1.court).toBe("Court V2");
    expect(ev2.roundNumber).toBe(2);
    expect(ev2.court).toBe("Court V6");
  });

  it("parses DTSTART with TZID to the correct UTC instant", () => {
    const [ev1] = parseIcs(REV_SAMPLE);
    // 2026-04-14 21:40 Melbourne (AEST, UTC+10) → 11:40 UTC
    expect(ev1.start?.toISOString()).toBe("2026-04-14T11:40:00.000Z");
  });
});

describe("mapEventsForTeam", () => {
  it("derives opponent from the side that is not our team", () => {
    const events = parseIcs(REV_SAMPLE);
    const mapped = mapEventsForTeam(events, "Hustlers");
    expect(mapped[0].opponent).toBe("Volleybros");
    expect(mapped[1].opponent).toBe("Dizzy Dove");
  });

  it("matches team name case-insensitively", () => {
    const events = parseIcs(REV_SAMPLE);
    const mapped = mapEventsForTeam(events, "hustlers");
    expect(mapped[0].opponent).toBe("Volleybros");
  });

  it("produces a HH:MM gameTime string in Melbourne time", () => {
    const events = parseIcs(REV_SAMPLE);
    const mapped = mapEventsForTeam(events, "Hustlers");
    expect(mapped[0].gameTime).toBe("21:40");
    expect(mapped[1].gameTime).toBe("20:30");
  });

  it("falls back to 'A vs B' when team name is not in either side", () => {
    const events = parseIcs(REV_SAMPLE);
    const mapped = mapEventsForTeam(events, "Unknown");
    expect(mapped[0].opponent).toBe("Hustlers vs Volleybros");
  });
});
