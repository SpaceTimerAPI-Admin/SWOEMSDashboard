/**
 * GET /api/office-dashboard
 * Public endpoint — no auth required.
 * Aggregates everything needed for the office display in one parallel query.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { json } from "./_shared";

const TZ = "America/New_York";

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function todayRange() {
  const dateStr = todayET();
  const now = new Date();
  // 4 AM ET cutoff — same as EOD
  const cutoff = new Date(`${dateStr}T04:00:00`);
  const start = cutoff > now ? new Date(cutoff.getTime() - 86400000) : cutoff;
  return { start: start.toISOString(), end: now.toISOString() };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const handler: Handler = async () => {
  try {
    const supabase = supabaseAdmin();
    const { start, end } = todayRange();
    const now = new Date();
    const today = todayET();

    const [
      // Stats
      openRes,
      overdueRes,
      unassignedRes,
      openTodayRes,
      // Closed today
      closedTodayRes,
      // All open tickets (for spotlight + tag breakdown)
      openTicketsDetailRes,
      // GroupMe
      groupmeRes,
      // Shift log
      shiftLogRes,
      // Today's schedule
      scheduleRes,
    ] = await Promise.all([
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open").lt("sla_due_at", now.toISOString()),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open").is("assigned_to", null).eq("assigned_to_show_tech", false),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open").gte("created_at", start),
      // Closed today
      supabase.from("tickets")
        .select("id, title, location, tag, closed_at, employees!tickets_assigned_to_fkey(name)")
        .eq("status", "closed")
        .gte("closed_at", start).lte("closed_at", end)
        .order("closed_at", { ascending: false }).limit(25),
      // All open tickets with full detail for spotlight
      supabase.from("tickets")
        .select(`id, title, location, details, tag, created_at, sla_due_at, sla_minutes,
          assignee:employees!tickets_assigned_to_fkey(name),
          ticket_comments(id, created_at)`)
        .eq("status", "open")
        .order("sla_due_at", { ascending: true }),
      // GroupMe
      supabase.from("groupme_messages")
        .select("message_id, sender_name, text, created_at")
        .not("text", "is", null).not("text", "eq", "")
        .order("created_at", { ascending: false }).limit(35),
      // Shift log
      supabase.from("shift_log_entries")
        .select("id, note, created_at, employees!shift_log_entries_employee_id_fkey(name, role)")
        .gte("created_at", start).lte("created_at", end)
        .order("created_at", { ascending: false }).limit(20),
      // Today's schedule
      supabase.from("schedule_entries")
        .select("employee_name, shift_start, shift_end, all_shifts")
        .eq("work_date", today)
        .order("shift_start", { ascending: true, nullsFirst: false }),
    ]);

    const openCount      = openRes.count || 0;
    const overdueCount   = overdueRes.count || 0;
    const unassignedCount = unassignedRes.count || 0;
    const openTodayCount = openTodayRes.count || 0;
    const closedTodayCount = (closedTodayRes.data || []).length;

    const openTickets = (openTicketsDetailRes.data || []).map((t: any) => {
      const lastComment = (t.ticket_comments || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      const daysSinceUpdate = lastComment
        ? (now.getTime() - new Date(lastComment.created_at).getTime()) / 86400000
        : (now.getTime() - new Date(t.created_at).getTime()) / 86400000;
      const msLeft = new Date(t.sla_due_at).getTime() - now.getTime();
      return {
        id: t.id,
        title: t.title,
        location: t.location,
        tag: t.tag,
        created_at: t.created_at,
        sla_due_at: t.sla_due_at,
        assigned_name: t.assignee?.name || null,
        comment_count: (t.ticket_comments || []).length,
        days_since_update: Math.round(daysSinceUpdate * 10) / 10,
        is_overdue: msLeft < 0,
        hours_left: Math.round(msLeft / 3600000),
      };
    });

    // Tag breakdown
    const tagCounts: Record<string, number> = {};
    for (const t of openTickets) {
      const tag = t.tag || "Misc";
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }

    // Needs update: open tickets with no comment in 24h+ sorted by stalest first
    const needsUpdate = openTickets
      .filter(t => t.days_since_update >= 1)
      .sort((a, b) => b.days_since_update - a.days_since_update)
      .slice(0, 8);

    // Spotlight: 5 random open tickets (excluding already in needsUpdate to avoid repeats)
    const needsUpdateIds = new Set(needsUpdate.map(t => t.id));
    const spotlightPool = openTickets.filter(t => !needsUpdateIds.has(t.id));
    const spotlight = shuffle(spotlightPool).slice(0, 5);

    // Closed today
    const closedToday = (closedTodayRes.data || []).map((t: any) => ({
      id: t.id, title: t.title, location: t.location, tag: t.tag,
      closed_at: t.closed_at, assigned_name: t.employees?.name || null,
    }));

    // GroupMe
    const groupme = (groupmeRes.data || [])
      .filter((m: any) => m.text?.trim())
      .map((m: any) => ({ id: m.message_id, sender: m.sender_name || "Unknown", text: m.text, created_at: m.created_at }));

    // Shift log
    const shiftLog = (shiftLogRes.data || []).map((e: any) => ({
      id: e.id, note: e.note, created_at: e.created_at,
      employee_name: e.employees?.name || "Unknown",
      employee_role: e.employees?.role || "ems",
    }));

    // Today's schedule
    const schedule = (scheduleRes.data || []).map((e: any) => ({
      employee_name: e.employee_name,
      shift_start: e.shift_start,
      shift_end: e.shift_end,
      all_shifts: e.all_shifts,
    }));

    return json({
      ok: true,
      generated_at: now.toISOString(),
      stats: {
        open: openCount,
        overdue: overdueCount,
        unassigned: unassignedCount,
        opened_today: openTodayCount,
        closed_today: closedTodayCount,
        avg_age_days: openTickets.length
          ? Math.round(openTickets.reduce((s, t) => s + t.days_since_update, 0) / openTickets.length * 10) / 10
          : 0,
        tag_breakdown: tagCounts,
      },
      needs_update: needsUpdate,
      spotlight,
      closed_today: closedToday,
      groupme,
      shift_log: shiftLog,
      schedule,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
