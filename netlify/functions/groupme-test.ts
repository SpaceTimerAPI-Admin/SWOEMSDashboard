import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { json, unauthorized, badRequest } from "./_shared";
import { postGroupMe } from "./_groupme";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok:false, error:"Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();
  const body = event.body ? JSON.parse(event.body) : {};
  const text = String(body.text || "").trim();
  if (!text) return badRequest("text required");
  try {
    const resp = await postGroupMe(text);
    return json({ ok:true, resp });
  } catch (e:any) {
    console.error("GroupMe test failed:", e?.message || e);
    return json({ ok:false, error: e?.message || "GroupMe failed" }, 500);
  }
};
