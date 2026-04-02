/**
 * Returns today's ticket/project activity for the EOD preview screen.
 * Mirrors the exact same data logic used by send-eod.ts so the preview
 * always matches what gets emailed.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

const TZ = "America/New_York";

/** Returns UTC ISO start/end for a YYYY-MM-DD date in Eastern Time (handles DST). */
function etDayRange(day: string): { start: string; end: string } {
  const offsetMs = (d: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const etMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return d.getTime() - etMs;
  };
  const s = new Date(`${day}T00:00:00`);
  const e = new Date(`${day}T23:59:59.999`);
  return {
    start: new Date(s.getTime() + offsetMs(s)).toISOString(),
    end:   new Date(e.getTime() + offsetMs(e)).toISOString(),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const day = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const { start, end } = etDayRange(day);

    const supabase = supabaseAdmin();

    const [ticketsCreated, ticketsClosed, ticketsCommented,
           projectsCreated, projectsClosed, projectsCommented,
           olderOpenTickets, olderOpenProjects] = await Promise.all([
      supabase.from("tickets").select("id, title, location, tag, status, created_at, closed_at, created_by").gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("id, title, location, tag, status, created_at, closed_at, created_by").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("ticket_comments").select("ticket_id").gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("id, title, location, tag, status, created_at, closed_at, created_by").gte("created_at", start).lte("created_at", end),
      supabase.from("projects").select("id, title, location, tag, status, created_at, closed_at, created_by").gte("closed_at", start).lte("closed_at", end).not("closed_at", "is", null),
      supabase.from("project_comments").select("project_id").gte("created_at", start).lte("created_at", end),
      supabase.from("tickets").select("id, title, location, tag, created_at").eq("status", "open").lt("created_at", start).order("created_at", { ascending: true }),
      supabase.from("projects").select("id, title, location, tag, created_at").eq("status", "open").lt("created_at", start).order("created_at", { ascending: true }),
    ]);

    // Deduplicate today's tickets (created + closed + commented-on today)
    const ticketMap = new Map<string, any>();
    for (const t of [...(ticketsCreated.data || []), ...(ticketsClosed.data || [])]) ticketMap.set(t.id, t);
    const commentedTicketIds = [...new Set((ticketsCommented.data || []).map((c: any) => c.ticket_id))].filter(id => !ticketMap.has(id));
    if (commentedTicketIds.length) {
      const { data: extra } = await supabase.from("tickets").select("id, title, location, tag, status, created_at, closed_at, created_by").in("id", commentedTicketIds);
      for (const t of (extra || [])) ticketMap.set(t.id, t);
    }

    // Deduplicate today's projects
    const projectMap = new Map<string, any>();
    for (const p of [...(projectsCreated.data || []), ...(projectsClosed.data || [])]) projectMap.set(p.id, p);
    const commentedProjectIds = [...new Set((projectsCommented.data || []).map((c: any) => c.project_id))].filter(id => !projectMap.has(id));
    if (commentedProjectIds.length) {
      const { data: extra } = await supabase.from("projects").select("id, title, location, tag, status, created_at, closed_at, created_by").in("id", commentedProjectIds);
      for (const p of (extra || [])) projectMap.set(p.id, p);
    }

    const tickets = Array.from(ticketMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const projects = Array.from(projectMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return json({
      ok: true,
      day,
      tickets,
      projects,
      older_open_tickets: olderOpenTickets.data || [],
      older_open_projects: olderOpenProjects.data || [],
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
