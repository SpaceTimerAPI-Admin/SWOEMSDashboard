import crypto from "crypto";

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export function badRequest(message: string) {
  return json({ ok: false, error: message }, 400);
}

export function methodNotAllowed() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function unauthorized(message = "Unauthorized") {
  return json({ ok: false, error: message }, 401);
}

export function serverError(message = "Server error") {
  return json({ ok: false, error: message }, 500);
}

export function getIp(event: any): string | null {
  const hdrs = event.headers || {};
  return (
    hdrs["x-nf-client-connection-ip"] ||
    hdrs["x-forwarded-for"] ||
    hdrs["client-ip"] ||
    null
  );
}
