/**
 * POST /api/showtech-enrollment-code
 * Admin only — returns the current enrollment code so the QR page can build its URL.
 * The code is never in the client JS bundle.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();
    if ((session.employee as any).role !== "admin")
      return json({ ok: false, error: "Forbidden" }, 403);

    const code = process.env.SHOW_TECH_ENROLLMENT_CODE || "";
    if (!code) return json({ ok: false, error: "SHOW_TECH_ENROLLMENT_CODE not set in environment variables." }, 500);

    return json({ ok: true, code });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
