/**
 * GET /api/office-dashboard
 * Public endpoint — no auth required.
 * Aggregates everything for the office display.
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
  const cutoff = new Date(`${dateStr}T04:00:00`);
  const start = cutoff > now ? new Date(cutoff.getTime() - 86400000) : cutoff;
  return { start: start.toISOString(), end: now.toISOString() };
}

// Seeded shuffle — same order all day, rotates daily
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
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
    const daySeed = parseInt(today.replace(/-/g, ""), 10);

    const [
      // Counts: open tickets + open projects (combined = work orders)
      openTicketsCountRes,
      openProjectsCountRes,
      overdueTicketsRes,
      overdueProjectsRes,
      openedTodayRes,
      // Closed today
      closedTodayTicketsRes,
      closedTodayProjectsRes,
      // Full open tickets for needs-update + detail
      openTicketsDetailRes,
      // GroupMe
      groupmeRes,
      // Shift log
      shiftLogRes,
      // Schedule
      scheduleRes,
      // BEO events today
      beoRes,
    ] = await Promise.all([
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("projects").select("id", { count: "exact", head: true }).neq("status", "closed"),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open").lt("sla_due_at", now.toISOString()),
      supabase.from("projects").select("id", { count: "exact", head: true }).neq("status", "closed").lt("sla_due_at", now.toISOString()),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open").gte("created_at", start),

      supabase.from("tickets")
        .select("id, title, location, details, tag, closed_at, employees!tickets_assigned_to_fkey(name)")
        .eq("status", "closed").gte("closed_at", start).lte("closed_at", end)
        .order("closed_at", { ascending: false }).limit(30),

      supabase.from("projects")
        .select("id, title, location, details, tag, closed_at, employees!projects_assigned_to_fkey(name)")
        .eq("status", "closed").gte("closed_at", start).lte("closed_at", end)
        .order("closed_at", { ascending: false }).limit(15),

      supabase.from("tickets")
        .select(`id, title, location, details, tag, created_at, sla_due_at, sla_minutes,
          assignee:employees!tickets_assigned_to_fkey(name),
          ticket_comments(id, comment, created_at, employees!ticket_comments_employee_id_fkey(name)),
          ticket_photos(id, public_url, created_at)`)
        .eq("status", "open").order("sla_due_at", { ascending: true }),

      supabase.from("groupme_messages")
        .select("message_id, sender_name, text, created_at")
        .not("text", "is", null).not("text", "eq", "")
        .order("created_at", { ascending: false }).limit(40),

      supabase.from("shift_log_entries")
        .select("id, note, created_at, employees!shift_log_entries_employee_id_fkey(name, role)")
        .gte("created_at", start).lte("created_at", end)
        .order("created_at", { ascending: false }).limit(30),

      supabase.from("schedule_entries")
        .select("employee_name, shift_start, shift_end, all_shifts")
        .eq("work_date", today)
        .order("shift_start", { ascending: true, nullsFirst: false }),

      // BEO events today
      supabase.from("beo_events")
        .select("id, event_name, event_date, pdf_url, beo_actions(id, action_type, completed_at)")
        .eq("event_date", today)
        .is("deleted_at", null)
        .order("event_name"),
    ]);

    const openTickets  = openTicketsCountRes.count || 0;
    const openProjects = openProjectsCountRes.count || 0;
    const openTotal    = openTickets + openProjects;
    const overdueTotal = (overdueTicketsRes.count || 0) + (overdueProjectsRes.count || 0);
    const openedToday  = openedTodayRes.count || 0;

    // Process open tickets
    const openTicketsDetail = (openTicketsDetailRes.data || []).map((t: any) => {
      const comments = (t.ticket_comments || []).sort((a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const lastComment = [...comments].reverse()[0];
      const daysSinceUpdate = lastComment
        ? (now.getTime() - new Date(lastComment.created_at).getTime()) / 86400000
        : (now.getTime() - new Date(t.created_at).getTime()) / 86400000;
      const msLeft = new Date(t.sla_due_at).getTime() - now.getTime();
      return {
        id: t.id, title: t.title, location: t.location, details: t.details,
        tag: t.tag, created_at: t.created_at, sla_due_at: t.sla_due_at,
        assigned_name: t.assignee?.name || null,
        photos: (t.ticket_photos || []).map((p: any) => ({ id: p.id, url: p.public_url, created_at: p.created_at })),
        comments: comments.map((c: any) => ({ id: c.id, comment: c.comment, created_at: c.created_at, employee_name: c.employees?.name || "Staff" })),
        comment_count: comments.length,
        days_since_update: Math.round(daysSinceUpdate * 10) / 10,
        is_overdue: msLeft < 0,
        hours_left: Math.round(msLeft / 3600000),
      };
    });

    // Tag breakdown (tickets only since projects rarely have tags)
    const tagCounts: Record<string, number> = {};
    for (const t of openTicketsDetail) {
      const tag = t.tag || "Misc";
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }

    // Avg age
    const avgAge = openTicketsDetail.length
      ? Math.round(openTicketsDetail.reduce((s, t) => s + t.days_since_update, 0) / openTicketsDetail.length * 10) / 10
      : 0;

    // Needs update: stale tickets, seeded shuffle so it rotates daily
    const needsUpdatePool = openTicketsDetail.filter(t => t.days_since_update >= 1)
      .sort((a, b) => b.days_since_update - a.days_since_update);
    const needsUpdate = needsUpdatePool.slice(0, 10);

    // Closed today — merge tickets + projects
    const closedToday = [
      ...(closedTodayTicketsRes.data || []).map((t: any) => ({
        id: t.id, title: t.title, location: t.location, details: t.details || "",
        tag: t.tag, closed_at: t.closed_at, type: "ticket",
        assigned_name: t.employees?.name || null,
      })),
      ...(closedTodayProjectsRes.data || []).map((p: any) => ({
        id: p.id, title: p.title, location: p.location, details: p.details || "",
        tag: p.tag, closed_at: p.closed_at, type: "project",
        assigned_name: p.employees?.name || null,
      })),
    ].sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());

    const groupme = (groupmeRes.data || [])
      .filter((m: any) => m.text?.trim())
      .map((m: any) => ({ id: m.message_id, sender: m.sender_name || "Unknown", text: m.text, created_at: m.created_at }));

    const shiftLog = (shiftLogRes.data || []).map((e: any) => ({
      id: e.id, note: e.note, created_at: e.created_at,
      employee_name: e.employees?.name || "Unknown",
      employee_role: e.employees?.role || "ems",
    }));

    const schedule = (scheduleRes.data || []).map((e: any) => ({
      employee_name: e.employee_name,
      shift_start: e.shift_start,
      shift_end: e.shift_end,
      all_shifts: e.all_shifts,
    }));

    const beoEvents = (beoRes.data || []).map((ev: any) => {
      const actions = ev.beo_actions || [];
      const setup  = actions.find((a: any) => a.action_type === "setup");
      const strike = actions.find((a: any) => a.action_type === "strike");
      return {
        id: ev.id,
        event_name: ev.event_name,
        pdf_url: ev.pdf_url || null,
        setup_done:  !!setup?.completed_at,
        strike_done: !!strike?.completed_at,
      };
    });

    return json({
      ok: true,
      generated_at: now.toISOString(),
      stats: {
        open: openTotal,
        open_tickets: openTickets,
        open_projects: openProjects,
        overdue: overdueTotal,
        opened_today: openedToday,
        closed_today: closedToday.length,
        avg_age_days: avgAge,
        tag_breakdown: tagCounts,
      },
      needs_update: needsUpdate,
      closed_today: closedToday,
      groupme,
      shift_log: shiftLog,
      schedule,
      beo_events: beoEvents,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
