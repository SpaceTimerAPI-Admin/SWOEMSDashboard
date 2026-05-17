import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";

const TZ = "America/New_York";

function etDayRange(day: string): { start: string; end: string } {
  const offsetMs = (d: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const etMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return d.getTime() - etMs;
  };
  const s = new Date(`${day}T00:00:00`);
  const e = new Date(`${day}T23:59:59.999`);
  return {
    start: new Date(s.getTime() + offsetMs(s)).toISOString(),
    end:   new Date(e.getTime() + offsetMs(e)).toISOString(),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET")
      return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const day = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const { start, end } = etDayRange(day);

    const role = (session.employee as any).role || "ems";

    const supabase = supabaseAdmin();
    let q = supabase
      .from("shift_log_entries")
      .select("id, note, created_at, employee_id, employees!shift_log_entries_employee_id_fkey(name, role)")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    let entries = (data || []).map((e: any) => ({
      id: e.id,
      note: e.note,
      created_at: e.created_at,
      employee_id: e.employee_id,
      employee_name: e.employees?.name || "Unknown",
      employee_role: e.employees?.role || "ems",
    }));

    // Show Tech: only see entries from show_tech users
    if (role === "show_tech") {
      entries = entries.filter((e: any) => e.employee_role === "show_tech");
    }

    return json({ ok: true, entries });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
