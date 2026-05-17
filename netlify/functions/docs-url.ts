import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    // Only EMS and Admin can access documents
    const role = (session.employee as any).role || "ems";
    if (role === "show_tech") return json({ ok: false, error: "Forbidden" }, 403);

    const url = process.env.DOCS_URL || "";
    if (!url) return json({ ok: false, error: "DOCS_URL not configured" }, 500);
    return json({ ok: true, url });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
