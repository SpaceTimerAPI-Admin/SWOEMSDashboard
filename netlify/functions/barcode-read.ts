/**
 * POST /api/barcode-read
 * Accepts a base64-encoded image frame from the camera and asks Claude to
 * read the serial number / barcode value from the label.
 *
 * Body: { image: "data:image/jpeg;base64,..." | "<raw base64>", mediaType?: "image/jpeg" }
 * Returns: { ok: true, value: "SN-12345" } or { ok: false, error: "..." }
 *
 * Uses raw fetch (no SDK dependency) matching the pattern in ask-elijah.ts.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { json, unauthorized, badRequest } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const body = event.body ? JSON.parse(event.body) : {};
  const { image, mediaType } = body;
  if (!image) return badRequest("image required");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ ok: false, error: "API key not configured" }, 500);

  // Strip the data URI prefix if present
  const base64 = image.replace(/^data:image\/\w+;base64,/, "");
  const mtype = (mediaType || "image/jpeg") as string;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mtype, data: base64 },
            },
            {
              type: "text",
              text: `This is an equipment label from a lighting, audio, or video fixture used at SeaWorld Entertainment.

Extract the serial number from this label. Look for:
- Text labeled "Serial No", "S/N", "SN", "Serial Number", or similar
- The number printed beneath any barcode on the label
- Any unique alphanumeric identifier that looks like a serial number

Reply with JSON only:
{
  "serial": "the main serial number, or null if not found",
  "candidates": ["array of all possible serial/ID numbers found on label"],
  "note": "brief description of what you found"
}

Do not include label prefixes like "Serial No:" in the values — just the raw values.
If you cannot find any serial number, return serial: null.`,
            },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[barcode-read] Claude error:", res.status, err.slice(0, 200));
      return json({ ok: false, error: `Vision API error ${res.status}` }, 500);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    try {
      const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean);
      return json({
        ok: true,
        serial: parsed.serial || null,
        candidates: parsed.candidates || [],
        note: parsed.note || "",
      });
    } catch {
      // Fallback: try to extract any alphanumeric code
      const match = text.match(/[A-Z]{1,3}[0-9]{4,}/);
      return json({ ok: true, serial: match ? match[0] : null, candidates: [], note: text.slice(0, 100) });
    }
  } catch (err: any) {
    console.error("[barcode-read] Error:", err?.message);
    return json({ ok: false, error: err?.message || "Server error" }, 500);
  }
};
