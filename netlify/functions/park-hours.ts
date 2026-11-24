/**
 * GET /api/park-hours
 * Today's SeaWorld Orlando park hours, from the ThemeParks.wiki API.
 * Public (the TV dashboard has no login) — the data is public park hours.
 * Cached for 30 minutes so the site never hammers the API.
 */
import type { Handler } from "@netlify/functions";

const ENTITY_ID = "27d64dee-d85e-48dc-ad6d-8077445cd946"; // SeaWorld Orlando
const API_URL   = `https://api.themeparks.wiki/v1/entity/${ENTITY_ID}/schedule`;
const TZ        = "America/New_York";
const CACHE_MS  = 30 * 60 * 1000;

type Entry = { date?: string; type?: string; openingTime?: string; closingTime?: string; description?: string };

let cache: { at: number; schedule: Entry[] } | null = null;

function todayET(): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function fmtTime(iso: string): string {
  const s = new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
  return s.replace(":00 ", " "); // "9:00 AM" -> "9 AM"
}

function respond(body: unknown, statusCode = 200, maxAge = 600) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": statusCode === 200 ? `public, max-age=${maxAge}` : "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function loadSchedule(): Promise<Entry[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.schedule;
  const res = await fetch(API_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ThemeParks.wiki responded ${res.status}`);
  const data: any = await res.json();
  const schedule: Entry[] = Array.isArray(data?.schedule) ? data.schedule : [];
  cache = { at: Date.now(), schedule };
  return schedule;
}

export const handler: Handler = async () => {
  const date = todayET();
  try {
    let schedule: Entry[];
    try {
      schedule = await loadSchedule();
    } catch (e) {
      // API down — fall back to the last copy we have, however old.
      if (!cache) throw e;
      schedule = cache.schedule;
    }

    const allToday = schedule.filter(e => e?.date === date);
    // No entry at all for today = the API has no data, which is not the same as "closed".
    if (allToday.length === 0) {
      return respond({ ok: false, date, error: "No park hours published for today" }, 200, 300);
    }
    const today = allToday.filter(e => e.openingTime && e.closingTime);
    const operating = today.filter(e => String(e.type || "").toUpperCase() === "OPERATING");
    const extras    = today.filter(e => String(e.type || "").toUpperCase() !== "OPERATING");

    if (operating.length === 0) {
      return respond({ ok: true, date, open: false, label: "Park closed today", opens: null, closes: null, extras: [] });
    }

    // If the day is split into several operating blocks, show first open → last close.
    const opens  = operating.map(e => e.openingTime!).sort((a, b) => +new Date(a) - +new Date(b))[0];
    const closes = operating.map(e => e.closingTime!).sort((a, b) => +new Date(b) - +new Date(a))[0];

    return respond({
      ok: true,
      date,
      open: true,
      opens,
      closes,
      label: `${fmtTime(opens)} – ${fmtTime(closes)}`,
      // Separately ticketed events / extra hours, if the park lists any today.
      extras: extras.map(e => ({
        name: e.description || String(e.type || "").replace(/_/g, " ").toLowerCase(),
        label: `${fmtTime(e.openingTime!)} – ${fmtTime(e.closingTime!)}`,
      })),
    });
  } catch (e: any) {
    console.error("[park-hours] Error:", e?.message);
    return respond({ ok: false, date, error: e?.message || "Park hours unavailable" }, 502);
  }
};
