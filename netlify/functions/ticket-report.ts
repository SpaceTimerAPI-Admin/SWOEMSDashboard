/**
 * GET /api/ticket-report?search=odyssey&since=2026-05-25
 * Admin/EMS only. Returns tickets + AI analysis of patterns.
 */
import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { requireSession } from "./_auth";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function fmtET(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function hourET(iso: string): number {
  return parseInt(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
}

function dayOfWeekET(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" });
}

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const emp = (session as any).employee as any;
  if (emp.role === "show_tech") return json({ error: "Forbidden" }, 403);

  const search = (event.queryStringParameters?.search || "odyssey").toLowerCase().trim();
  const since  = event.queryStringParameters?.since  || "2026-05-25";

  const supabase = supabaseAdmin();

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select(`
      id, title, location, details, status, tag,
      created_at, closed_at, sla_due_at, sla_minutes,
      created_by_emp:employees!tickets_created_by_fkey(name),
      assigned_emp:employees!tickets_assigned_to_fkey(name),
      comments:ticket_comments(
        comment, created_at,
        commenter:employees!ticket_comments_employee_id_fkey(name)
      )
    `)
    .gte("created_at", since + "T00:00:00.000Z")
    .or(`title.ilike.%${search}%,location.ilike.%${search}%,details.ilike.%${search}%`)
    .order("created_at", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  if (!tickets || tickets.length === 0) return json({ ok: true, tickets: [], analysis: null, search, since });

  // ── Build context for AI analysis ────────────────────────────────────────
  const ticketContext = tickets.map((t: any, i: number) => {
    const comments = (t.comments || [])
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((c: any) => `    [${fmtET(c.created_at)}] ${c.commenter?.name || "Staff"}: ${c.comment}`)
      .join("\n");

    const closed = t.status === "closed" && t.closed_at
      ? `\n  Closed: ${fmtET(t.closed_at)}`
      : "";

    const hour = hourET(t.created_at);
    const timeOfDay = hour < 6 ? "overnight" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
    const day = dayOfWeekET(t.created_at);

    return `TICKET ${i + 1}: ${t.title}
  Status: ${t.status} | Tag: ${t.tag || "none"} | Location: ${t.location || "—"}
  Opened: ${fmtET(t.created_at)} (${day}, ${timeOfDay})${closed}
  Submitted by: ${t.created_by_emp?.name || "unknown"}
  Assigned to: ${t.assigned_emp?.name || "unassigned"}
  Details: ${(t.details || "").slice(0, 400)}
${comments ? `  Comments:\n${comments}` : "  No comments"}`;
  }).join("\n\n");

  // ── AI Analysis ──────────────────────────────────────────────────────────
  let analysis: any = null;
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const prompt = `You are analyzing maintenance ticket data for SeaWorld Entertainment to identify patterns and recurring issues. This report is being prepared for management to make the case that internal systemic issues need to be corrected.

Search term: "${search}"
Date range: ${since} to today
Total tickets: ${tickets.length}

TICKET DATA:
${ticketContext}

Please analyze this data and provide a structured report with these sections:

1. EXECUTIVE SUMMARY
A 2-3 sentence overview of the situation — how many tickets, over what timeframe, and the overall severity of the pattern.

2. RECURRING ISSUES
Group tickets by the type of problem they describe. For each recurring issue type, list how many times it appeared and what the pattern looks like. Be specific about what keeps breaking or failing.

3. FREQUENCY & TIMING ANALYSIS
- How often are tickets being submitted (per week/month)?
- What time of day do most issues occur (morning, afternoon, evening, overnight)?
- What days of the week see the most issues?
- Is there a trend — getting worse over time, clustered around certain periods?

4. RESOLUTION ANALYSIS
- How quickly are issues being resolved on average?
- Are there tickets that stayed open too long?
- Are the same issues being "resolved" repeatedly without a permanent fix?

5. KEY FINDINGS FOR MANAGEMENT
3-5 bullet points that make the strongest case that these are systemic/internal issues rather than one-off events. Be direct and specific — cite actual ticket counts, dates, and patterns.

6. RECOMMENDED ACTIONS
What systemic fixes or investigations should management prioritize based on this data?

Write in a professional tone appropriate for a management report. Be factual and data-driven. Use the actual ticket titles, dates, and details from the data above.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        analysis = data.content?.[0]?.text || null;
      }
    }
  } catch (e) {
    console.error("[ticket-report] AI analysis error:", e);
  }

  return json({ ok: true, tickets: tickets || [], analysis, search, since });
};
