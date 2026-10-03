/**
 * POST /api/barcode-read
 * Accepts a base64-encoded JPEG frame from the camera and asks Claude to
 * read the serial number / barcode value from the label in the image.
 *
 * Body: { image: "data:image/jpeg;base64,..." }
 * Returns: { ok: true, value: "SN-12345" } or { ok: false, error: "..." }
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { json, unauthorized, badRequest } from "./_shared";
import Anthropic from "@anthropic-ai/sdk";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(event);
  if (!session) return unauthorized();

  const body = event.body ? JSON.parse(event.body) : {};
  const { image } = body;
  if (!image) return badRequest("image required");

  // Strip the data URI prefix if present
  const base64 = image.replace(/^data:image\/\w+;base64,/, "");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            {
              type: "text",
              text: `Look at this image of an equipment label or barcode.
Find the serial number, barcode value, or asset tag printed on the label.
Reply with ONLY the raw value — no explanation, no label name, no punctuation.
If you see multiple codes, pick the most prominent one (usually the longest alphanumeric string or the barcode).
If you cannot read any serial / barcode, reply with exactly: NONE`,
            },
          ],
        },
      ],
    });

    const raw = (response.content[0] as any)?.text?.trim() || "NONE";
    if (raw === "NONE" || raw === "") {
      return json({ ok: false, error: "Could not read a serial number from the image. Try again or type it manually." });
    }
    return json({ ok: true, value: raw });
  } catch (err: any) {
    console.error("barcode-read error:", err);
    return json({ ok: false, error: err?.message || "Vision API error" }, 500);
  }
};
