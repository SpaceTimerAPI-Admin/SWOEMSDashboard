/**
 * GET /api/ticket-report?search=odyssey&since=2026-05-25
 * Admin/EMS only. Returns all tickets matching a location/title/details
 * search term since a given date, with their comments.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { requireSession } from "./_auth";

function json(body: unknown, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const emp = session.employee as any;
  if (emp.role === "show_tech") return json({ error: "Forbidden" }, 403);

  const search = (event.queryStringParameters?.search || "odyssey").toLowerCase();
  const since  = event.queryStringParameters?.since || "2026-05-25";

  const supabase = supabaseAdmin();

  // Fetch tickets matching search in title, location, or details
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select(`
      id, title, location, details, status, tag,
      created_at, closed_at, sla_due_at, sla_minutes,
      created_by_emp:employees!tickets_created_by_fkey(name),
      assigned_emp:employees!tickets_assigned_to_fkey(name),
      comments:ticket_comments(
        comment, created_at,
        commenter:employees!ticket_comments_employee_id_fkey(name)
      )
    `)
    .gte("created_at", since + "T00:00:00.000Z")
    .or(`title.ilike.%${search}%,location.ilike.%${search}%,details.ilike.%${search}%`)
    .order("created_at", { ascending: true });

  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, tickets: tickets || [], search, since });
};
