/**
 * Shared logic for Show Tech "Today's Tasks".
 * Everything is keyed by business day (4 AM ET cutoff), so shifts and assignments
 * reset by themselves each night — nothing has to be cleared.
 */
import { todayBusinessDay, businessDayRange } from "./_eod-day";

export const SHARE = 4; // each tech gets about 1/4 of the open tickets

/** How many tickets one tech should get out of `openCount` open tickets. */
export function shareSize(openCount: number): number {
  if (openCount <= 0) return 0;
  return Math.max(1, Math.round(openCount / SHARE));
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Today's tasks for one tech, plus who else is on shift. */
export async function loadTasks(
  supabase: any,
  emp: { id: string },
  opts: { day?: string; withActivity?: boolean } = {},
) {
  const day = opts.day || todayBusinessDay();

  const [shiftsRes, assignsRes] = await Promise.all([
    supabase.from("showtech_shifts").select("employee_id, employee_name, started_at")
      .eq("business_day", day).order("started_at", { ascending: true }),
    supabase.from("xmas_task_assignments").select("ticket_id, employee_id, employee_name, assigned_at")
      .eq("business_day", day),
  ]);
  if (shiftsRes.error) throw new Error(shiftsRes.error.message);
  if (assignsRes.error) throw new Error(assignsRes.error.message);

  const shifts  = shiftsRes.data || [];
  const assigns = assignsRes.data || [];
  const ticketIds = assigns.map((a: any) => a.ticket_id);

  let tickets: any[] = [];
  let comments: any[] = [];
  if (ticketIds.length > 0) {
    const [tRes, cRes] = await Promise.all([
      supabase.from("xmas_tickets")
        .select("id, location_friendly, description, tech_name, status, created_at, photo_url")
        .in("id", ticketIds),
      supabase.from("xmas_ticket_comments")
        .select("ticket_id, author, body, created_at")
        .in("ticket_id", ticketIds)
        .order("created_at", { ascending: true }),
    ]);
    tickets  = tRes.data || [];
    comments = cRes.data || [];
  }

  const ticketById = new Map(tickets.map((t: any) => [Number(t.id), t]));

  // A task counts as done once an update was added after it was assigned today.
  const tasks = assigns
    .map((a: any) => {
      const t = ticketById.get(Number(a.ticket_id));
      if (!t) return null; // ticket was deleted
      const since = new Date(a.assigned_at).getTime();
      const updates = comments.filter((c: any) =>
        Number(c.ticket_id) === Number(a.ticket_id) && new Date(c.created_at).getTime() >= since);
      const last = updates[updates.length - 1] || null;
      return {
        employee_id: a.employee_id,
        ticket_id: Number(a.ticket_id),
        assigned_at: a.assigned_at,
        location: t.location_friendly,
        description: t.description,
        reported_by: t.tech_name,
        created_at: t.created_at,
        status: t.status,
        photo_url: t.photo_url || null,
        updated: !!last,
        last_update: last ? { author: last.author, body: last.body, created_at: last.created_at } : null,
      };
    })
    .filter(Boolean) as any[];

  const mine = tasks.filter(t => t.employee_id === emp.id)
    .sort((a, b) => Number(a.updated) - Number(b.updated) || a.ticket_id - b.ticket_id);

  // Admin view: how many Christmas tickets each on-shift tech opened and closed that day.
  const activity = opts.withActivity ? await loadActivity(supabase, day, shifts) : null;

  const team = shifts.map((s: any) => {
    const theirs = tasks.filter(t => t.employee_id === s.employee_id);
    return {
      name: s.employee_name,
      started_at: s.started_at,
      total: theirs.length,
      updated: theirs.filter(t => t.updated).length,
      is_me: s.employee_id === emp.id,
      ...(activity ? activity.get(s.employee_id) : {}),
    };
  });

  return {
    business_day: day,
    on_shift: shifts.some((s: any) => s.employee_id === emp.id),
    tasks: mine,
    team,
  };
}

/**
 * Per on-shift tech for one business day:
 *   opened — Christmas tickets they created that day
 *   closed — Christmas tickets they marked fixed that day (and that are still fixed)
 * Uses the recorded opened/fixed events. A ticket with no recorded opener (created
 * before tracking existed, or while logged out) is matched on the name typed on it.
 */
async function loadActivity(supabase: any, day: string, shifts: any[]) {
  const { start, end } = businessDayRange(day);
  const out = new Map<string, { opened: number; closed: number }>();
  for (const s of shifts) out.set(s.employee_id, { opened: 0, closed: 0 });
  if (shifts.length === 0) return out;

  const [createdRes, eventsRes] = await Promise.all([
    supabase.from("xmas_tickets").select("id, tech_name, created_at")
      .gte("created_at", start).lte("created_at", end),
    supabase.from("xmas_ticket_events").select("ticket_id, action, employee_id, created_at")
      .gte("created_at", start).lte("created_at", end)
      .order("created_at", { ascending: true }),
  ]);
  const created: any[] = createdRes.data || [];
  const events: any[]  = eventsRes.data || []; // empty if the events table doesn't exist yet

  // Opened
  const openerByTicket = new Map<number, string | null>();
  for (const e of events) if (e.action === "opened") openerByTicket.set(Number(e.ticket_id), e.employee_id);
  const idByName = new Map<string, string>(
    shifts.map((s: any): [string, string] => [String(s.employee_name || "").trim().toLowerCase(), s.employee_id]));
  for (const t of created) {
    const recorded = openerByTicket.get(Number(t.id));
    const who = recorded || idByName.get(String(t.tech_name || "").trim().toLowerCase());
    if (who && out.has(who)) out.get(who)!.opened++;
  }

  // Closed — the last fixed/reopened event of the day decides; reopened tickets don't count.
  const lastByTicket = new Map<number, any>();
  for (const e of events) if (e.action === "fixed" || e.action === "reopened") lastByTicket.set(Number(e.ticket_id), e);
  for (const e of lastByTicket.values()) {
    if (e.action === "fixed" && e.employee_id && out.has(e.employee_id)) out.get(e.employee_id)!.closed++;
  }
  return out;
}
