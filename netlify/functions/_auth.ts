import { supabaseAdmin } from "./_supabase";
import { sha256Hex } from "./_shared";

export async function requireSession(event: any) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, employee_id, expires_at")
    .eq("session_token_hash", tokenHash)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const expiresAt = new Date(data.expires_at).getTime();
  if (Date.now() > expiresAt) return null;

  // touch last_seen_at (best effort)
  await supabase.from("sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);

  // fetch employee profile
  const { data: emp } = await supabase
    .from("employees")
    .select("id, employee_id, name, email, is_active")
    .eq("id", data.employee_id)
    .limit(1)
    .maybeSingle();

  if (!emp || !emp.is_active) return null;
  return { token, employee: emp };
}
