import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { postGroupMe } from "./_groupme";
import { badRequest, json, unauthorized } from "./_shared";

/**
 * POST /api/notify-event
 * body: { type: 'procedure_completed'|'ticket_created'|'ticket_closed'|'ticket_converted'|'project_created'|'project_closed', message: string }
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const type = String(body.type || "").trim();
    const message = String(body.message || "").trim();

    if (!type) return badRequest("type required");
    if (!message) return badRequest("message required");

    // Keep messages short and consistent
    await postGroupMe(message);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
