export interface ParsedFixtureEvent {
  uid: string;
  start: Date | null;
  summary: string;
  location: string | null;
  roundNumber: number | null;
  teamA: string | null;
  teamB: string | null;
  venue: string | null;
  court: string | null;
  isBye: boolean;
}

export interface FixtureMapped {
  externalId: string;
  roundNumber: number;
  date: Date | null;
  gameTime: string | null;
  opponent: string | null;
  venue: string | null;
  court: string | null;
  isBye: boolean;
}

function unfoldLines(ics: string): string[] {
  const rawLines = ics.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of rawLines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (out.length) out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(v: string): string {
  return v.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseIcsDate(value: string, params: Record<string, string>): Date | null {
  // value forms: 20260414T214000, 20260414T214000Z, 20260414
  const isUtc = value.endsWith("Z") || params.VALUE === "DATE-UTC";
  const clean = value.replace(/Z$/, "");
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const tz = params.TZID;

  if (isUtc || !tz) {
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  // Interpret wall time in given TZ by finding UTC offset for that instant.
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(naive));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const asIfUtc = Date.UTC(
    +map.year, +map.month - 1, +map.day,
    +map.hour === 24 ? 0 : +map.hour, +map.minute, +map.second,
  );
  const offset = asIfUtc - naive;
  return new Date(naive - offset);
}

export function parseIcs(ics: string): ParsedFixtureEvent[] {
  const lines = unfoldLines(ics);
  const events: ParsedFixtureEvent[] = [];
  let cur: Partial<ParsedFixtureEvent> & { _startRaw?: string; _startParams?: Record<string, string> } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) {
        const start = cur._startRaw ? parseIcsDate(cur._startRaw, cur._startParams || {}) : null;
        const ev = buildEvent(cur as ParsedFixtureEvent, start);
        if (ev.uid) events.push(ev);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const [name, ...paramParts] = rawKey.split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq)] = p.slice(eq + 1);
    }
    const key = name.toUpperCase();

    if (key === "UID") cur.uid = value;
    else if (key === "SUMMARY") cur.summary = unescapeText(value);
    else if (key === "LOCATION") cur.location = unescapeText(value);
    else if (key === "DTSTART") {
      cur._startRaw = value;
      cur._startParams = params;
    }
  }
  return events;
}

function buildEvent(partial: ParsedFixtureEvent, start: Date | null): ParsedFixtureEvent {
  const summary = partial.summary || "";
  const location = partial.location || null;

  const roundMatch = summary.match(/\bRound\s+(\d+)\b/i);
  const roundNumber = roundMatch ? parseInt(roundMatch[1], 10) : null;

  let teamA: string | null = null;
  let teamB: string | null = null;
  const isBye = /\bbye\b/i.test(summary);

  const vsMatch = summary.match(/\bRound\s+\d+\s*[-–—:]\s*(.+?)\s+v(?:s)?\.?\s+(.+?)\s*$/i)
    || summary.match(/-\s*([^-]+?)\s+v(?:s)?\.?\s+([^-]+?)\s*$/i);
  if (vsMatch) {
    teamA = vsMatch[1].trim();
    teamB = vsMatch[2].trim();
  }

  let venue: string | null = null;
  let court: string | null = null;
  if (location) {
    const m = location.match(/^(.+?)\s*[-–—]\s*(Court\s+.+|Ct\s+.+)$/i);
    if (m) {
      venue = m[1].trim();
      court = m[2].trim();
    } else {
      venue = location;
    }
  }

  return {
    uid: partial.uid ?? "",
    start,
    summary,
    location,
    roundNumber,
    teamA,
    teamB,
    venue,
    court,
    isBye,
  };
}

export function mapEventsForTeam(
  events: ParsedFixtureEvent[],
  teamName: string,
): FixtureMapped[] {
  const lcTeam = teamName.trim().toLowerCase();
  const out: FixtureMapped[] = [];
  let fallbackRound = 0;
  for (const ev of events) {
    fallbackRound += 1;
    const roundNumber = ev.roundNumber ?? fallbackRound;

    let opponent: string | null = null;
    if (ev.teamA && ev.teamB) {
      const a = ev.teamA.toLowerCase();
      const b = ev.teamB.toLowerCase();
      if (a === lcTeam) opponent = ev.teamB;
      else if (b === lcTeam) opponent = ev.teamA;
      else opponent = `${ev.teamA} vs ${ev.teamB}`;
    }

    const date = ev.start;
    const gameTime = date
      ? date.toLocaleTimeString("en-AU", {
          hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Australia/Melbourne",
        })
      : null;

    out.push({
      externalId: ev.uid,
      roundNumber,
      date,
      gameTime,
      opponent,
      venue: ev.venue,
      court: ev.court,
      isBye: ev.isBye,
    });
  }
  return out;
}
