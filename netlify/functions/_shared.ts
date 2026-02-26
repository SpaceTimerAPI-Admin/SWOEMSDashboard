export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  path?: string;
  maxAge?: number;
  domain?: string;
};

export function setCookie(
  name: string,
  value: string,
  opts?: CookieOptions
) {
  const parts: string[] = [];
  parts.push(`${name}=${value}`);

  if (opts?.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts?.path) parts.push(`Path=${opts.path}`);
  if (opts?.domain) parts.push(`Domain=${opts.domain}`);
  if (opts?.httpOnly) parts.push("HttpOnly");
  if (opts?.secure) parts.push("Secure");
  if (opts?.sameSite) parts.push(`SameSite=${opts.sameSite}`);

  return parts.join("; ");
}