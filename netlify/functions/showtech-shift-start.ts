/**
 * POST /api/showtech-shift-start
 * Called when a Show Tech acknowledges the shift briefing.
 *   1. Marks them "on shift" for today's business day.
 *   2. Randomly assigns them about 1/4 of the open Christmas tickets, drawn only from
 *      tickets nobody else on shift today already has — so two techs never share a ticket.
 * Safe to call more than once: a tech who is already on shift just gets their list back.
 * Resets nightly because everything is keyed by business day. Auth required (Show Techs).
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { json, unauthorized } from "./_shared";
import { todayBusinessDay } from "./_eod-day";
import { loadTasks, shareSize, shuffle } from "./_showtech-tasks";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();
    const emp = session.employee as any;
    if (emp.role !== "show_tech") {
      return json({ ok: false, error: "Only Show Tech accounts are assigned shift tasks." }, 403);
    }

    const supabase = supabaseAdmin();
    const day = todayBusinessDay();

    // Already on shift today? Then tickets were already handed out — don't deal again.
    const { data: existingShift, error: shiftErr } = await supabase
      .from("showtech_shifts").select("id")
      .eq("business_day", day).eq("employee_id", emp.id).maybeSingle();
    if (shiftErr) return json({ ok: false, error: shiftErr.message }, 500);

    let newlyAssigned = 0;
    let openCount = 0;

    if (!existingShift) {
      // ignoreDuplicates: a double-tap can't create two shifts or deal two hands.
      const { data: created, error: insErr } = await supabase
        .from("showtech_shifts")
        .upsert({ business_day: day, employee_id: emp.id, employee_name: emp.name },
                { onConflict: "business_day,employee_id", ignoreDuplicates: true })
        .select("id");
      if (insErr) return json({ ok: false, error: insErr.message }, 500);

      if (created && created.length > 0) {
        const openRes = await supabase.from("xmas_tickets").select("id").eq("status", "open");
        if (openRes.error) return json({ ok: false, error: openRes.error.message }, 500);
        const openIds = (openRes.data || []).map((t: any) => Number(t.id));
        openCount = openIds.length;

        // About 1/4 of everything open, but never more than what is still unclaimed.
        const target = shareSize(openIds.length);

        // If another tech starts in the same instant and takes some of the same picks,
        // the table's UNIQUE (business_day, ticket_id) drops those — so there is never an
        // overlap — and we go round again to top this tech back up from what is left.
        for (let attempt = 0; attempt < 4 && newlyAssigned < target; attempt++) {
          const takenRes = await supabase.from("xmas_task_assignments").select("ticket_id").eq("business_day", day);
          if (takenRes.error) return json({ ok: false, error: takenRes.error.message }, 500);
          const taken = new Set((takenRes.data || []).map((x: any) => Number(x.ticket_id)));
          const picks = shuffle(openIds.filter(id => !taken.has(id))).slice(0, target - newlyAssigned);
          if (picks.length === 0) break; // every open ticket is already claimed today

          const { data: rows, error: aErr } = await supabase
            .from("xmas_task_assignments")
            .upsert(
              picks.map(ticket_id => ({ business_day: day, ticket_id, employee_id: emp.id, employee_name: emp.name })),
              { onConflict: "business_day,ticket_id", ignoreDuplicates: true },
            )
            .select("ticket_id");
          if (aErr) return json({ ok: false, error: aErr.message }, 500);
          newlyAssigned += (rows || []).length;
        }
        console.log(`[showtech-shift-start] ${emp.name} on shift ${day}: ${newlyAssigned} of ${openCount} open tickets assigned.`);
      }
    }

    const data = await loadTasks(supabase, emp);
    return json({ ok: true, newly_assigned: newlyAssigned, ...data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
