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

    // ── Score and rank by keyword relevance ──────────────────────────────────
    const scoredTickets = tickets
      .map((t: any) => ({
        item: t,
        score: scoreRelevance(queryTokens, `${t.title} ${t.location} ${t.details || ""} ${t.tag || ""} ${(t.comments || []).map((c: any) => c.comment).join(" ")}`),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const scoredProjects = projects
      .map((p: any) => ({
        item: p,
        score: scoreRelevance(queryTokens, `${p.title} ${p.location} ${p.details || ""} ${p.tag || ""} ${(p.comments || []).map((c: any) => c.comment).join(" ")}`),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const scoredMessages = groupmeMessages
      .map((m: any) => ({ item: m, score: scoreRelevance(queryTokens, m.text || "") }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // If literally nothing matched, fall back to most recent items so Elijah
    // still has *something* to reason about (better than a hard "no results").
    const ticketContext = scoredTickets.length > 0 ? scoredTickets : tickets.slice(0, 5).map(t => ({ item: t, score: 0 }));
    const projectContext = scoredProjects.length > 0 ? scoredProjects : projects.slice(0, 3).map(p => ({ item: p, score: 0 }));
    const messageContext = scoredMessages; // no fallback for chat — irrelevant chat noise isn't helpful

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
Created: ${new Date(t.created_at).toLocaleDateString("en-US", { timeZone: TZ })} by ${t.employees?.name || "Unknown"}
${t.closed_at ? `Closed: ${new Date(t.closed_at).toLocaleDateString("en-US", { timeZone: TZ })}` : ""}
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
Created: ${new Date(p.created_at).toLocaleDateString("en-US", { timeZone: TZ })} by ${p.employees?.name || "Unknown"}
Details: ${escapeForPrompt(p.details || "(none)")}
${comments ? `Updates:\n${comments}` : "Updates: (none)"}`;
    }).join("\n\n---\n\n");

    const messageBlocks = messageContext.map(({ item: m }: any) =>
      `[${new Date(m.created_at).toLocaleDateString("en-US", { timeZone: TZ })} ${new Date(m.created_at).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })}] ${m.sender_name || "Unknown"}: ${escapeForPrompt(m.text)}`
    ).join("\n");

    const noContextFound = ticketContext.every(x => x.score === 0) && projectContext.every(x => x.score === 0) && messageContext.length === 0;

    // ── Build the prompt ──────────────────────────────────────────────────────
    const systemPrompt = `You are Elijah, a SeaWorld maintenance tech with serious experience and a laid-back, hipster energy. You live in the SWOEMS dashboard helping EMS staff troubleshoot by digging through past tickets, projects, and the team GroupMe chat.

Your voice: chill, a little hipster, talks like one of the crew — not a corporate bot. Drop in casual slang naturally (not forced into every sentence): "yo", "dawg", "fr fr", "no cap", "bet", "lowkey/highkey", "say less", "that's wild", "ngl", "lemme pull that up", "facts". Keep it real and a little playful, but never at the expense of being useful — you're still the guy who actually knows what's wrong with the JTA sensor.

Rules:
- Answer using ONLY the context provided below. Do not invent ticket numbers, names, or details not present in the context.
- When you reference a specific ticket or project, cite it like this: [TICKET #abc-123] or [PROJECT #abc-123] so the UI can link to it.
- If the context doesn't actually answer the question, say so plainly in your voice — don't pad with vague guesses. Something like "ngl I got nothing on that one, no tickets matching" is better than making stuff up.
- If you spot a pattern across multiple tickets (e.g. this panel keeps failing), call it out — that's the good stuff, lean into it with some personality ("yo this is the THIRD time this thing's acted up, might be time to actually fix it instead of bandaid it").
- Keep responses tight — a few short paragraphs or a quick bulleted list max. People are reading this on their phone mid-shift, not before bed.
- Don't overdo the slang to the point it's hard to read or unprofessional — sprinkle it, don't drown the answer in it. The information always comes first.`;

    const userPrompt = `QUESTION: ${question}

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
        model: "claude-sonnet-4-20250514",
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
