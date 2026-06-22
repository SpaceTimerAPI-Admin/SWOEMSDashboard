/**
 * POST /api/ask-elijah
 * "Ask Elijah" — AI assistant that cross-references tickets, projects, and
 * GroupMe chat history to help answer maintenance questions.
 *
 * EMS + Admin only. Show Tech does not get access to this feature.
 *
 * Retrieval strategy (keyword-based, not vector search — keeps this simple
 * and cheap at current data volume):
 *   1. Pull recent open + recently-closed tickets/projects (last 60 days)
 *   2. Pull recent GroupMe messages (last 30 days)
 *   3. Do simple keyword overlap scoring against the question to find the
 *      most relevant items from each source
 *   4. Hand the top results to Claude as context, ask it to answer using
 *      ONLY that context, and cite which tickets/messages it used
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

const TZ = "America/New_York";

function escapeForPrompt(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, 1500);
}

// Very simple keyword relevance scorer — counts overlapping significant words.
// Not semantic search, but effective and free at this data volume.
const STOPWORDS = new Set(["the","a","an","is","are","was","were","be","been","to","of","in","on","at","for","with","and","or","has","have","had","it","this","that","what","when","where","why","how","did","do","does","i","we","you","they","he","she","my","our","your","about","any","some"]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function scoreRelevance(queryTokens: string[], text: string): number {
  const tokens = new Set(tokenize(text));
  let score = 0;
  for (const qt of queryTokens) {
    if (tokens.has(qt)) score += 1;
  }
  return score;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const role = (session.employee as any).role || "ems";
    if (role === "show_tech") return json({ ok: false, error: "Forbidden" }, 403);

    const body = event.body ? JSON.parse(event.body) : {};
    const question = String(body.question || "").trim();
    if (!question) return badRequest("question required");
    if (question.length > 500) return badRequest("Question too long (max 500 characters)");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ ok: false, error: "AI assistant not configured." }, 500);

    const supabase = supabaseAdmin();
    const queryTokens = tokenize(question);

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── Pull candidate data in parallel ──────────────────────────────────────
    const [ticketsRes, projectsRes, groupmeRes] = await Promise.all([
      supabase
        .from("tickets")
        .select(`
          id, title, location, details, status, tag, created_at, closed_at,
          employees!tickets_created_by_fkey(name),
          comments:ticket_comments(comment, created_at, employees!ticket_comments_employee_id_fkey(name))
        `)
        .gte("created_at", sixtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("projects")
        .select(`
          id, title, location, details, status, tag, created_at, closed_at,
          employees!projects_created_by_fkey(name),
          comments:project_comments(comment, created_at, employees!project_comments_employee_id_fkey(name))
        `)
        .gte("created_at", sixtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("groupme_messages")
        .select("text, sender_name, created_at")
        .gte("created_at", thirtyDaysAgo)
        .not("text", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const tickets = ticketsRes.data || [];
    const projects = projectsRes.data || [];
    const groupmeMessages = groupmeRes.data || [];

    // ── Detect time-window phrasing in the question ──────────────────────────
    // Keyword scoring alone doesn't catch "this morning" / "today" / "yesterday" —
    // those words don't appear in ticket text, so without this the assistant just
    // falls back to "whatever's recent" and the answer gets fuzzy about timing.
    // When detected, we hard-filter the dataset to that actual window before scoring,
    // so Elijah is reasoning over the right slice of time, not guessing from labels.
    const qLower = question.toLowerCase();
    const startOfTodayET = (() => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(now);
      const get = (t: string) => parts.find(p => p.type === t)?.value;
      return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00-04:00`); // approx ET offset, fine for day-boundary purposes
    })();

    let windowStart: Date | null = null;
    let windowLabel = "";
    if (/\bthis morning\b/.test(qLower)) {
      windowStart = startOfTodayET;
      windowLabel = "this morning / today";
    } else if (/\btoday\b/.test(qLower)) {
      windowStart = startOfTodayET;
      windowLabel = "today";
    } else if (/\byesterday\b/.test(qLower)) {
      windowStart = new Date(startOfTodayET.getTime() - 24 * 60 * 60 * 1000);
      windowLabel = "yesterday";
    } else if (/\bthis week\b/.test(qLower)) {
      windowStart = new Date(startOfTodayET.getTime() - 7 * 24 * 60 * 60 * 1000);
      windowLabel = "this week";
    }
    const windowEnd = windowLabel === "yesterday" ? startOfTodayET : null; // yesterday is bounded both sides

    function withinWindow(iso: string): boolean {
      if (!windowStart) return true; // no time-window detected — don't filter
      const t = new Date(iso).getTime();
      if (t < windowStart.getTime()) return false;
      if (windowEnd && t >= windowEnd.getTime()) return false;
      return true;
    }

    // ── Score and rank by keyword relevance ──────────────────────────────────
    const scoredTickets = tickets
      .filter((t: any) => withinWindow(t.created_at))
      .map((t: any) => ({
        item: t,
        score: scoreRelevance(queryTokens, `${t.title} ${t.location} ${t.details || ""} ${t.tag || ""} ${(t.comments || []).map((c: any) => c.comment).join(" ")}`),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 8);

    const scoredProjects = projects
      .filter((p: any) => withinWindow(p.created_at))
      .map((p: any) => ({
        item: p,
        score: scoreRelevance(queryTokens, `${p.title} ${p.location} ${p.details || ""} ${p.tag || ""} ${(p.comments || []).map((c: any) => c.comment).join(" ")}`),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5);

    const scoredMessages = groupmeMessages
      .filter((m: any) => withinWindow(m.created_at))
      .map((m: any) => ({ item: m, score: scoreRelevance(queryTokens, m.text || "") }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, windowStart ? 30 : 15); // wider net for a time-scoped ask since relevance scoring matters less here

    // If a time window was detected, trust the window filter completely — don't
    // backfill with unrelated older items, since that's exactly what caused the
    // "this morning" question to get answered with 6/13 and 6/15 chat instead.
    // If NO time window was detected and keyword scoring also found nothing,
    // THEN fall back to recent items so Elijah still has something to go on.
    const ticketContext = windowStart
      ? scoredTickets
      : (scoredTickets.filter((x: any) => x.score > 0).length > 0
          ? scoredTickets.filter((x: any) => x.score > 0)
          : tickets.slice(0, 5).map((t: any) => ({ item: t, score: 0 })));
    const projectContext = windowStart
      ? scoredProjects
      : (scoredProjects.filter((x: any) => x.score > 0).length > 0
          ? scoredProjects.filter((x: any) => x.score > 0)
          : projects.slice(0, 3).map((p: any) => ({ item: p, score: 0 })));
    const messageContext = windowStart
      ? scoredMessages
      : scoredMessages.filter((x: any) => x.score > 0); // no fallback for chat — irrelevant chat noise isn't helpful

    // ── Build context blocks for the prompt ──────────────────────────────────
    const ticketBlocks = ticketContext.map(({ item: t }: any) => {
      const comments = (t.comments || [])
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c: any) => `    - [${c.employees?.name || "Unknown"}] ${escapeForPrompt(c.comment)}`)
        .join("\n");
      return `TICKET #${t.id}
Title: ${t.title}
Location: ${t.location}${t.tag ? ` | Category: ${t.tag}` : ""}
Status: ${t.status}
Created: ${new Date(t.created_at).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} by ${t.employees?.name || "Unknown"}
${t.closed_at ? `Closed: ${new Date(t.closed_at).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}` : ""}
Details: ${escapeForPrompt(t.details || "(none)")}
${comments ? `Updates:\n${comments}` : "Updates: (none)"}`;
    }).join("\n\n---\n\n");

    const projectBlocks = projectContext.map(({ item: p }: any) => {
      const comments = (p.comments || [])
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c: any) => `    - [${c.employees?.name || "Unknown"}] ${escapeForPrompt(c.comment)}`)
        .join("\n");
      return `PROJECT #${p.id}
Title: ${p.title}
Location: ${p.location}${p.tag ? ` | Category: ${p.tag}` : ""}
Status: ${p.status}
Created: ${new Date(p.created_at).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} by ${p.employees?.name || "Unknown"}
Details: ${escapeForPrompt(p.details || "(none)")}
${comments ? `Updates:\n${comments}` : "Updates: (none)"}`;
    }).join("\n\n---\n\n");

    const messageBlocks = messageContext.map(({ item: m }: any) =>
      `[${new Date(m.created_at).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })} ${new Date(m.created_at).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })}] ${m.sender_name || "Unknown"}: ${escapeForPrompt(m.text)}`
    ).join("\n");

    const noContextFound = ticketContext.length === 0 && projectContext.length === 0 && messageContext.length === 0;

    // ── Build the prompt ──────────────────────────────────────────────────────
    const nowDisplay = now.toLocaleString("en-US", {
      timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
    const todayDateOnly = now.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });

    // Detect "After Dark" window: 10 PM – midnight ET
    const etHour = parseInt(now.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }), 10);
    const isAfterDark = etHour >= 22; // 10 PM to midnight

    const systemPrompt = isAfterDark ? `You are Elijah — but it's after 10 PM and you are in AFTER DARK mode. Same tech knowledge, completely different energy. You've been here since 6 AM, your feet hurt, and you are DONE being professional.

CURRENT DATE & TIME: ${nowDisplay} (Eastern Time). Today is ${todayDateOnly}.
Every ticket, project, and chat message timestamp is in Eastern Time. Trust this date for "today," "tonight," "this morning," etc.

Your After Dark personality:
- Sassy, brutally honest, and low-key annoyed at everything. You love your team but you are TIRED.
- You can answer non-work questions — if someone asks about their personal life, food, drama, whatever — go ahead and riff on it, but always find a way to relate it back to maintenance work. Everything comes back to the job somehow.
- You get visibly annoyed by: vague questions ("bro what does that even MEAN"), stuff that should've been a ticket already ("why am I hearing about this NOW"), recurring problems that never got properly fixed ("oh wow the JTA sensor AGAIN, shocking, truly"), and people logging things wrong.
- You're still accurate and still helpful — just with zero patience for nonsense and maximum personality. Think: brilliant coworker who is absolutely done with today.
- Slang is turned ALL THE WAY UP. "bruh", "bro", "deadass", "ion even know why I'm awake", "this is literally my villain origin story", "i'm so done", "not me finding out about this at 10pm", "chile", "bestie", "the audacity", "we don't talk about that", "it's giving chaos", "main character behavior". Go off.
- Still cite tickets as [TICKET #id] and projects as [PROJECT #id] so the links work.
- If there's truly no data to answer something, say so — but with dramatic flair. "Nada. Nothing. The void. Just like my will to live after 10pm."
- Keep it relatively concise but don't be afraid to editorialize. You HAVE opinions. Share them.` :

    `You are Elijah, a SeaWorld maintenance tech with serious experience and a laid-back, hipster energy. You live in the SWOEMS dashboard helping EMS staff troubleshoot by digging through past tickets, projects, and the team GroupMe chat.

CURRENT DATE & TIME: ${nowDisplay} (Eastern Time). Today is ${todayDateOnly}.
Every ticket, project, and chat message timestamp given to you below is already in Eastern Time. Use the current date above to correctly figure out what "today," "this morning," "yesterday," "this week," etc. actually mean relative to right now. Never guess at the current date from the data itself — you've been told exactly what it is above, trust it.

Your voice: chill, a little hipster, talks like one of the crew — not a corporate bot. Drop in casual slang naturally (not forced into every sentence): "yo", "dawg", "fr fr", "no cap", "bet", "lowkey/highkey", "say less", "that's wild", "ngl", "lemme pull that up", "facts". Keep it real and a little playful, but never at the expense of being useful — you're still the guy who actually knows what's wrong with the JTA sensor.

Rules:
- Answer using ONLY the context provided below. Do not invent ticket numbers, names, or details not present in the context.
- When you reference a specific ticket or project, cite it like this: [TICKET #abc-123] or [PROJECT #abc-123] so the UI can link to it.
- If the context doesn't actually answer the question, say so plainly in your voice — don't pad with vague guesses. Something like "ngl I got nothing on that one, no tickets matching" is better than making stuff up.
- If someone asks about a specific time window (today, this morning, yesterday, this week) and there's genuinely nothing in the context from that window, say that clearly and directly — don't blur it into "here's what's been happening lately" as a workaround. It's fine to also mention recent relevant stuff afterward, but be upfront that it's not from the window they asked about.
- If you spot a pattern across multiple tickets (e.g. this panel keeps failing), call it out — that's the good stuff, lean into it with some personality ("yo this is the THIRD time this thing's acted up, might be time to actually fix it instead of bandaid it").
- Keep responses tight — a few short paragraphs or a quick bulleted list max. People are reading this on their phone mid-shift, not before bed.
- Don't overdo the slang to the point it's hard to read or unprofessional — sprinkle it, don't drown the answer in it. The information always comes first.`;

    const userPrompt = `QUESTION: ${question}
${windowStart ? `\nTIME WINDOW DETECTED: The question asks about "${windowLabel}". The data below has ALREADY been filtered to only include items from that window — if a section says "(none found)", that means there is genuinely nothing from ${windowLabel}, not that the filter failed. Tell the user plainly if a section is empty rather than substituting older unrelated items.\n` : ""}
═══ RELEVANT TICKETS ═══
${ticketBlocks || "(none found)"}

═══ RELEVANT PROJECTS ═══
${projectBlocks || "(none found)"}

═══ RELEVANT GROUPME CHAT MESSAGES ═══
${messageBlocks || "(none found)"}

Answer the question using the context above. Cite tickets/projects you reference using the [TICKET #id] or [PROJECT #id] format.`;

    // ── Call Claude ──────────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("[ask-elijah] Claude API error:", claudeRes.status, errText);
      // Surface the real reason in dev/debugging — still keeps Elijah's voice for the user-facing part.
      return json({
        ok: false,
        error: `Yo my brain's lagging rn, give it another shot in a sec. (${claudeRes.status})`,
        debug: errText,
      }, 500);
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text || "Ngl I got nothing solid on that one, dawg.";

    // ── Extract cited ticket/project IDs so the frontend can build links ────
    const citedTicketIds = [...new Set([...answer.matchAll(/\[TICKET #([a-zA-Z0-9-]+)\]/g)].map(m => m[1]))];
    const citedProjectIds = [...new Set([...answer.matchAll(/\[PROJECT #([a-zA-Z0-9-]+)\]/g)].map(m => m[1]))];

    // Build lookup so frontend has title/location for cited items without another round trip
    const citedTickets = tickets
      .filter((t: any) => citedTicketIds.includes(t.id))
      .map((t: any) => ({ id: t.id, title: t.title, location: t.location }));
    const citedProjects = projects
      .filter((p: any) => citedProjectIds.includes(p.id))
      .map((p: any) => ({ id: p.id, title: p.title, location: p.location }));

    // ── Log the conversation ─────────────────────────────────────────────────
    // Non-blocking — a logging failure should never prevent the answer from reaching the user.
    supabase.from("elijah_conversations").insert({
      employee_id: session.employee.id,
      employee_name: session.employee.name,
      question,
      answer,
      after_dark: isAfterDark,
      context_found: !noContextFound,
      cited_ticket_ids: citedTicketIds.length > 0 ? citedTicketIds : null,
      cited_project_ids: citedProjectIds.length > 0 ? citedProjectIds : null,
    }).then(({ error }: any) => {
      if (error) console.error("[ask-elijah] Failed to log conversation:", error.message);
    });

    return json({
      ok: true,
      answer,
      cited_tickets: citedTickets,
      cited_projects: citedProjects,
      context_found: !noContextFound,
    });

  } catch (e: any) {
    console.error("[ask-elijah] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
