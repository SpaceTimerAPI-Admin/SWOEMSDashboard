/**
 * POST /api/inventory-read-label
 * Accepts a base64 image, sends to Claude vision to extract serial number.
 * Public endpoint — no auth required (used from dashboard and app).
 */
import type { Handler } from "@netlify/functions";
import { json } from "./_shared";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { image, mediaType } = body;

    if (!image) return json({ ok: false, error: "image required" }, 400);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ ok: false, error: "API key not configured" }, 500);

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
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: image,
              },
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
            }
          ]
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[inventory-read-label] Claude error:", res.status, err.slice(0, 200));
      return json({ ok: false, error: `Claude API error ${res.status}` }, 500);
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
      const match = text.match(/[A-Z]{1,3}[0-9]{4,}/);
      return json({ ok: true, serial: match ? match[0] : null, candidates: [], note: text.slice(0, 100) });
    }
  } catch (e: any) {
    console.error("[inventory-read-label] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
