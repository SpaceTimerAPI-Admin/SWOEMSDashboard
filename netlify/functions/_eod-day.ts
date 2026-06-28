/**
 * Shared "business day" helpers for EOD reporting.
 * A "day" runs from 4:00 AM ET to 3:59:59.999 AM ET the next calendar day.
 * Example: anything between 12:00 AM and 3:59 AM ET counts as the PREVIOUS day's report.
 */

export const TZ = "America/New_York";
const CUTOFF_HOUR = 4; // 4 AM

/** Returns the "business day" (YYYY-MM-DD, ET) that `instant` falls into, given the 4 AM cutoff. */
export function businessDayFor(instant: Date): string {
  // Get the ET wall-clock time for the instant
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const year = get("year"), month = get("month"), day = get("day"), hour = get("hour");

  // If before 4 AM ET, it belongs to the previous calendar day
  const d = new Date(Date.UTC(year, month - 1, day));
  if (hour < CUTOFF_HOUR) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

/** Returns today's business day in ET (accounting for the 4 AM cutoff). */
export function todayBusinessDay(): string {
  return businessDayFor(new Date());
}

/** Returns the previous business day — used by eod-scheduled which runs just AFTER the cutoff closes. */
export function previousBusinessDay(): string {
  // Go back 20 hours from now — guaranteed to land in the previous business day
  // regardless of DST, since business days are 24h long and we only need "one day back."
  return businessDayFor(new Date(Date.now() - 20 * 60 * 60 * 1000));
}

/**
 * Returns UTC ISO start/end for a business day (YYYY-MM-DD).
 * Start = 4:00:00 AM ET on `day`. End = 3:59:59.999 AM ET on `day + 1`.
 * Handles DST correctly by computing the ET->UTC offset for each boundary instant.
 */
export function businessDayRange(day: string): { start: string; end: string } {
  const offsetMs = (d: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const etMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return d.getTime() - etMs;
  };

  const [y, m, dd] = day.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);

  const s = new Date(`${day}T${String(CUTOFF_HOUR).padStart(2, "0")}:00:00`);
  const e = new Date(`${nextDay}T${String(CUTOFF_HOUR).padStart(2, "0")}:00:00`);
  e.setMilliseconds(e.getMilliseconds() - 1); // 3:59:59.999 AM next day

  return {
    start: new Date(s.getTime() + offsetMs(s)).toISOString(),
    end:   new Date(e.getTime() + offsetMs(e)).toISOString(),
  };
}
