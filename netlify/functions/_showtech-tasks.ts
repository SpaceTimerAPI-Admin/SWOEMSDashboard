/**
 * Shared logic for Show Tech "Today's Tasks".
 * Everything is keyed by business day (4 AM ET cutoff), so shifts and assignments
 * reset by themselves each night — nothing has to be cleared.
 */
import { todayBusinessDay } from "./_eod-day";

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
export async function loadTasks(supabase: any, emp: { id: string }) {
  const day = todayBusinessDay();

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

  const team = shifts.map((s: any) => {
    const theirs = tasks.filter(t => t.employee_id === s.employee_id);
    return {
      name: s.employee_name,
      started_at: s.started_at,
      total: theirs.length,
      updated: theirs.filter(t => t.updated).length,
      is_me: s.employee_id === emp.id,
    };
  });

  return {
    business_day: day,
    on_shift: shifts.some((s: any) => s.employee_id === emp.id),
    tasks: mine,
    team,
  };
}
