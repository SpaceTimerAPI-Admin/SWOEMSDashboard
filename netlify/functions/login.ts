import type { Handler } from "@netlify/functions";
import { setCookie } from "./_shared";

export const handler: Handler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const sessionToken = body.sessionToken || "dummy-session";

  const cookie = setCookie("session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    domain: ".swoems.com",
    maxAge: 60 * 60 * 24 * 7,
  });

  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": cookie,
    },
    body: JSON.stringify({ ok: true }),
  };
};