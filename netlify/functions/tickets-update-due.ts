/**
 * POST /api/tickets-update-due
 * Updates a ticket's sla_due_at and logs a comment recording who changed it and when.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

const TZ = "America/New_York";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const session = await requireSession(event);
  if (!session) return unauthorized();
  const emp = session.employee as any;

  const body = event.body ? JSON.parse(event.body) : {};
  const ticketId = String(body.ticket_id || body.id || "").trim();
  const newDueDate = String(body.due_date || "").trim(); // YYYY-MM-DD

  if (!ticketId) return badRequest("ticket_id required");
  if (!newDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) return badRequest("due_date required (YYYY-MM-DD)");

  const supabase = supabaseAdmin();

  // Fetch current ticket for context
  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id, title, sla_due_at, sla_minutes")
    .eq("id", ticketId)
    .single();

  if (fetchErr || !ticket) return json({ ok: false, error: "Ticket not found" }, 404);

  // Calculate new sla_due_at (end of the selected day in ET)
  const newDueAt = new Date(`${newDueDate}T23:59:59`);
  const now = new Date();
  const sla_minutes = Math.max(1, Math.round((newDueAt.getTime() - now.getTime()) / 60000));

  // Format old due date for the comment
  const oldDue = ticket.sla_due_at
    ? new Date(ticket.sla_due_at).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : "not set";
  const newDue = newDueAt.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric" });

  // Update the ticket
  const { error: updateErr } = await supabase
    .from("tickets")
    .update({ sla_due_at: newDueAt.toISOString(), sla_minutes })
    .eq("id", ticketId);

  if (updateErr) return json({ ok: false, error: updateErr.message }, 500);

  // Log as a comment
  const commentText = `📅 Due date updated by ${emp.name}\nFrom: ${oldDue}\nTo: ${newDue}`;
  await supabase.from("ticket_comments").insert({
    ticket_id: ticketId,
    employee_id: emp.id,
    comment: commentText,
  });

  return json({ ok: true, sla_due_at: newDueAt.toISOString(), sla_minutes });
};
