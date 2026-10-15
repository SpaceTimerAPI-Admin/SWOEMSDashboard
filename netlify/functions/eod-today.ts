/**
 * Returns ticket/project activity for the EOD preview screen, for a given business day.
 * A "business day" runs 4:00 AM ET to 3:59:59.999 AM ET the next day.
 * Mirrors the exact same data logic used by send-eod.ts so the preview
 * always matches what gets emailed.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { businessDayRange, todayBusinessDay } from "./_eod-day";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const requestedDay = String(body.date || "").trim();
    const day = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) ? requestedDay : todayBusinessDay();
    const { start, end } = businessDayRange(day);

    const supabase = supabaseAdmin();

    const [ticketsCreated, ticketsClosed, ticketsCommented,
           projectsCreated, projectsClosed, projectsCommented,
           olderOpenTickets, olderOpenProjects, shiftLogRes] = await Promise.all([
      supabase.from("tickets").select("id, title, location, tag, status, details, created_at, closed_at, created_by").gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("id, title, location, tag, status, details, created_at, closed_at, created_by").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("ticket_comments")
        .select("ticket_id, comment, created_at, employee_id, employees!ticket_comments_employee_id_fkey(name)")
        .gte("created_at", start).lte("created_at", end)
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, title, location, tag, status, created_at, closed_at, created_by").gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("id, title, location, tag, status, created_at, closed_at, created_by").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("project_comments")
        .select("project_id, comment, created_at, employee_id, employees!project_comments_employee_id_fkey(name)")
        .gte("created_at", start).lte("created_at", end)
        .order("created_at", { ascending: false }),
      supabase.from("tickets").select("id, title, location, tag, details, created_at").eq("status", "open").lt("created_at", start).order("created_at", { ascending: true }),
      supabase.from("projects").select("id, title, location, tag, details, created_at").eq("status", "open").lt("created_at", start).order("created_at", { ascending: true }),
      supabase.from("shift_log_entries")
        .select("id, note, created_at, employee_id, employees!shift_log_entries_employee_id_fkey(name)")
        .gte("created_at", start).lte("created_at", end)
        .order("created_at", { ascending: false }),
    ]);

    // Build a map of ALL today's comments per ticket (comments sorted desc = newest first)
    type CommentEntry = { comment: string; employee_name: string; created_at: string };
    const ticketCommentsMap = new Map<string, CommentEntry[]>();
    for (const c of (ticketsCommented.data || [])) {
      const entry: CommentEntry = {
        comment: c.comment,
        employee_name: (c as any).employees?.name || "Unknown",
        created_at: c.created_at,
      };
      if (!ticketCommentsMap.has(c.ticket_id)) ticketCommentsMap.set(c.ticket_id, []);
      ticketCommentsMap.get(c.ticket_id)!.push(entry);
    }

    // Build a map of ALL today's comments per project
    const projectCommentsMap = new Map<string, CommentEntry[]>();
    for (const c of (projectsCommented.data || [])) {
      const entry: CommentEntry = {
        comment: c.comment,
        employee_name: (c as any).employees?.name || "Unknown",
        created_at: c.created_at,
      };
      if (!projectCommentsMap.has(c.project_id)) projectCommentsMap.set(c.project_id, []);
      projectCommentsMap.get(c.project_id)!.push(entry);
    }

    // Track which ticket IDs had which activity today
    const createdTicketIds = new Set((ticketsCreated.data || []).map((t: any) => t.id));
    const closedTicketIds = new Set((ticketsClosed.data || []).map((t: any) => t.id));
    const commentedTicketIds = new Set((ticketsCommented.data || []).map((c: any) => c.ticket_id));

    const createdProjectIds = new Set((projectsCreated.data || []).map((p: any) => p.id));
    const closedProjectIds = new Set((projectsClosed.data || []).map((p: any) => p.id));
    const commentedProjectIds = new Set((projectsCommented.data || []).map((c: any) => c.project_id));

    // Determine activity label for a ticket
    function ticketActivity(id: string, status: string): string {
      if (createdTicketIds.has(id)) return "New Ticket";
      if (closedTicketIds.has(id)) return "Closed";
      if (commentedTicketIds.has(id)) return "New Comment";
      // Fallback: just show current status
      const s = (status || "").toLowerCase();
      if (s === "closed") return "Closed";
      return "Open";
    }

    function projectActivity(id: string, status: string): string {
      if (createdProjectIds.has(id)) return "New Project";
      if (closedProjectIds.has(id)) return "Closed";
      if (commentedProjectIds.has(id)) return "New Comment";
      const s = (status || "").toLowerCase();
      if (s === "closed") return "Closed";
      return "Open";
    }

    // Deduplicate today's tickets (created + closed + commented-on today)
    const ticketMap = new Map<string, any>();
    for (const t of [...(ticketsCreated.data || []), ...(ticketsClosed.data || [])]) ticketMap.set(t.id, t);
    const onlyCommentedTicketIds = [...commentedTicketIds].filter(id => !ticketMap.has(id));
    if (onlyCommentedTicketIds.length) {
      const { data: extra } = await supabase.from("tickets").select("id, title, location, tag, status, details, created_at, closed_at, created_by").in("id", onlyCommentedTicketIds);
      for (const t of (extra || [])) ticketMap.set(t.id, t);
    }

    // Deduplicate today's projects (created + closed + commented-on today)
    const projectMap = new Map<string, any>();
    for (const p of [...(projectsCreated.data || []), ...(projectsClosed.data || [])]) projectMap.set(p.id, p);
    const onlyCommentedProjectIds = [...commentedProjectIds].filter(id => !projectMap.has(id));
    if (onlyCommentedProjectIds.length) {
      const { data: extra } = await supabase.from("projects").select("id, title, location, tag, status, details, created_at, closed_at, created_by").in("id", onlyCommentedProjectIds);
      for (const p of (extra || [])) projectMap.set(p.id, p);
    }

    // Enrich each ticket with activity label and all today's comments (newest first)
    const tickets = Array.from(ticketMap.values())
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((t: any) => ({
        ...t,
        activity: ticketActivity(t.id, t.status),
        comments: ticketCommentsMap.get(t.id) || [],
      }));

    // Enrich each project with activity label and all today's comments (newest first)
    const projects = Array.from(projectMap.values())
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((p: any) => ({
        ...p,
        activity: projectActivity(p.id, p.status),
        comments: projectCommentsMap.get(p.id) || [],
      }));

    const shiftLogEntries = (shiftLogRes.data || []).map((e: any) => ({
      id: e.id, note: e.note, created_at: e.created_at,
      employee_id: e.employee_id, employee_name: e.employees?.name || "Unknown",
    }));

    return json({
      ok: true,
      day,
      tickets,
      projects,
      older_open_tickets: olderOpenTickets.data || [],
      older_open_projects: olderOpenProjects.data || [],
      shift_log_entries: shiftLogEntries,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
