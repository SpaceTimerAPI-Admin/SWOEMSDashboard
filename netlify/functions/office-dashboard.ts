/**
 * GET /api/office-dashboard
 * Aggregates all data for the office display dashboard.
 * Returns: stats, recent GroupMe messages, today's closed work orders, today's shift log entries.
 * No auth required — this is displayed on an office screen.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { json } from "./_shared";

const TZ = "America/New_York";

function todayRange(): { start: string; end: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value?.padStart(2, "0");
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  // Use 4 AM cutoff like EOD system
  const start = new Date(`${dateStr}T04:00:00`);
  const startActual = start > now ? new Date(start.getTime() - 86400000) : start;
  return {
    start: startActual.toISOString(),
    end: now.toISOString(),
  };
}

export const handler: Handler = async () => {
  try {
    const supabase = supabaseAdmin();
    const { start, end } = todayRange();

    const [
      openTicketsRes,
      closedTodayTicketsRes,
      openProjectsRes,
      closedTodayProjectsRes,
      groupmeRes,
      shiftLogRes,
      overdueTicketsRes,
    ] = await Promise.all([
      // Open ticket count
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),

      // Tickets closed today
      supabase.from("tickets")
        .select("id, title, location, tag, closed_at, employees!tickets_assigned_to_fkey(name)")
        .eq("status", "closed")
        .gte("closed_at", start)
        .lte("closed_at", end)
        .order("closed_at", { ascending: false })
        .limit(20),

      // Open project count
      supabase.from("projects").select("id", { count: "exact", head: true }).neq("status", "closed"),

      // Projects closed today
      supabase.from("projects")
        .select("id, title, location, tag, closed_at, employees!projects_assigned_to_fkey(name)")
        .eq("status", "closed")
        .gte("closed_at", start)
        .lte("closed_at", end)
        .order("closed_at", { ascending: false })
        .limit(10),

      // Recent GroupMe messages (last 30)
      supabase.from("groupme_messages")
        .select("message_id, sender_name, text, created_at")
        .not("text", "is", null)
        .not("text", "eq", "")
        .order("created_at", { ascending: false })
        .limit(30),

      // Today's shift log
      supabase.from("shift_log_entries")
        .select("id, note, created_at, employees!shift_log_entries_employee_id_fkey(name, role)")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(20),

      // Overdue open tickets
      supabase.from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .lt("sla_due_at", new Date().toISOString()),
    ]);

    const openTickets    = openTicketsRes.count || 0;
    const openProjects   = openProjectsRes.count || 0;
    const overdueTickets = overdueTicketsRes.count || 0;

    const closedToday = [
      ...(closedTodayTicketsRes.data || []).map((t: any) => ({
        id: t.id, title: t.title, location: t.location, tag: t.tag,
        closed_at: t.closed_at, type: "ticket",
        assigned_name: t.employees?.name || null,
      })),
      ...(closedTodayProjectsRes.data || []).map((p: any) => ({
        id: p.id, title: p.title, location: p.location, tag: p.tag,
        closed_at: p.closed_at, type: "project",
        assigned_name: p.employees?.name || null,
      })),
    ].sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());

    const groupme = (groupmeRes.data || [])
      .filter((m: any) => m.text && m.text.trim().length > 0)
      .map((m: any) => ({
        id: m.message_id,
        sender: m.sender_name || "Unknown",
        text: m.text,
        created_at: m.created_at,
      }));

    const shiftLog = (shiftLogRes.data || []).map((e: any) => ({
      id: e.id,
      note: e.note,
      created_at: e.created_at,
      employee_name: e.employees?.name || "Unknown",
      employee_role: e.employees?.role || "ems",
    }));

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      stats: {
        open_tickets: openTickets,
        open_projects: openProjects,
        open_total: openTickets + openProjects,
        closed_today: closedToday.length,
        overdue: overdueTickets,
      },
      closed_today: closedToday,
      groupme,
      shift_log: shiftLog,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
