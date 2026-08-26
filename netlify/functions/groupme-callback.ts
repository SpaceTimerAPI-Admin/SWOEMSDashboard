import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabase";
import { json } from "./_shared";
import { postGroupMe } from "./_groupme";

const TZ = "America/New_York";
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.swoems.com").replace(/\/$/, "");
const TRIGGER = "!askelijah";

// ── Shared helpers (mirrors ask-elijah.ts) ───────────────────────────────────
function escapeForPrompt(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, 1500);
}

const STOPWORDS = new Set(["the","a","an","is","are","was","were","be","been","to","of","in","on","at","for","with","and","or","has","have","had","it","this","that","what","when","where","why","how","did","do","does","i","we","you","they","he","she","my","our","your","about","any","some"]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function scoreRelevance(queryTokens: string[], text: string): number {
  const tokens = new Set(tokenize(text));
  let score = 0;
  for (const qt of queryTokens) { if (tokens.has(qt)) score += 1; }
  return score;
}

/**
 * Convert [TICKET #uuid] and [PROJECT #uuid] citations in Elijah's answer
 * to short swoems.com links so GroupMe shows clickable URLs.
 */
function expandCitations(text: string): string {
  // [TICKET #abc-123] → swoems.com/t/abc-123
  text = text.replace(/\[TICKET #([a-zA-Z0-9\-]+)\]/g, (_match, id) =>
    `${SITE_BASE_URL}/t/${id}`
  );
  // [PROJECT #abc-123] → swoems.com/p/abc-123
  text = text.replace(/\[PROJECT #([a-zA-Z0-9\-]+)\]/g, (_match, id) =>
    `${SITE_BASE_URL}/p/${id}`
  );
  return text;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const secret = process.env.GROUPME_CALLBACK_SECRET;
    if (secret) {
      const qs = event.queryStringParameters || {};
      if (qs.secret !== secret) return json({ ok: false, error: "Forbidden" }, 403);
    }

    const payload = event.body ? JSON.parse(event.body) : {};
    const group_id      = String(payload.group_id || "");
    const message       = payload?.text ?? null;
    const message_id    = String(payload?.id || payload?.message_id || "");
    const sender_user_id = payload?.user_id ? String(payload.user_id) : null;
    const sender_name   = payload?.name ? String(payload.name) : null;
    const created_at    = payload?.created_at
      ? new Date(Number(payload.created_at) * 1000).toISOString()
      : new Date().toISOString();
    const attachments_json = payload?.attachments ?? [];

    if (!group_id || !message_id) return json({ ok: true, ignored: true });

    const ignoreName = process.env.GROUPME_BOT_NAME;
    if (ignoreName && sender_name && sender_name.toLowerCase() === ignoreName.toLowerCase()) {
      return json({ ok: true, ignored: true });
    }

    const supabase = supabaseAdmin();

    // ── Store the message ─────────────────────────────────────────────────────
    const { error } = await supabase.from("groupme_messages").upsert({
      group_id, message_id, sender_user_id, sender_name,
      text: message, created_at, attachments_json, raw_payload: payload,
    }, { onConflict: "message_id" });

    if (error) return json({ ok: false, error: error.message }, 500);

    // ── Check for !askelijah trigger ─────────────────────────────────────────
    const msgText = (message || "").trim();
    const triggerIndex = msgText.toLowerCase().indexOf(TRIGGER);
    if (triggerIndex === -1) return json({ ok: true });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await postGroupMe("Elijah bot isn't configured right now — ask an admin.");
      return json({ ok: true });
    }

    // Extract the question — everything after !askelijah
    const question = msgText.slice(triggerIndex + TRIGGER.length).trim();
    if (!question) {
      await postGroupMe("yo what's the question? hit me with !askelijah [your question]");
      return json({ ok: true });
    }

    // ── Pull data (same as ask-elijah.ts) ────────────────────────────────────
    const now = new Date();
    const etHour = parseInt(now.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }), 10);
    const isAfterDark = etHour >= 22;
    const queryTokens = tokenize(question);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const elijahGroupMeName = process.env.GROUPME_BOT_NAME || "";

    const [ticketsRes, projectsRes, groupmeRes, recentConvosRes, elijahGroupMeRes] = await Promise.all([
      supabase.from("tickets").select(`
        id, title, location, details, status, tag, created_at, closed_at,
        employees!tickets_created_by_fkey(name),
        comments:ticket_comments(comment, created_at, employees!ticket_comments_employee_id_fkey(name))
      `).gte("created_at", sixtyDaysAgo).order("created_at", { ascending: false }).limit(150),
      supabase.from("projects").select(`
        id, title, location, details, status, tag, created_at, closed_at,
        employees!projects_created_by_fkey(name),
        comments:project_comments(comment, created_at, employees!project_comments_employee_id_fkey(name))
      `).gte("created_at", sixtyDaysAgo).order("created_at", { ascending: false }).limit(100),
      supabase.from("groupme_messages").select("text, sender_name, created_at")
        .gte("created_at", thirtyDaysAgo).not("text", "is", null)
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("elijah_conversations").select("answer, after_dark")
        .eq("after_dark", isAfterDark).order("created_at", { ascending: false }).limit(10),
      elijahGroupMeName
        ? supabase.from("groupme_messages").select("text, created_at")
            .ilike("sender_name", elijahGroupMeName).not("text", "is", null)
            .order("created_at", { ascending: false }).limit(40)
        : Promise.resolve({ data: [] }),
    ]);

    const tickets = ticketsRes.data || [];
    const projects = projectsRes.data || [];
    const groupmeMessages = groupmeRes.data || [];
    const recentConvos = recentConvosRes.data || [];
    const elijahGroupMeMessages = (elijahGroupMeRes as any).data || [];

    const elijahVoiceSamples = elijahGroupMeMessages
      .map((m: any) => m.text?.trim())
      .filter((t: string) => t && t.length > 5 && t.length < 200)
      .slice(0, 15);

    const recentAnswerSnippets = recentConvos
      .map((c: any) => c.answer?.split("\n")[0]?.slice(0, 120).trim())
      .filter(Boolean).slice(0, 8);

    // Time-window detection
    const qLower = question.toLowerCase();
    const startOfTodayET = (() => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(now);
      const get = (t: string) => parts.find(p => p.type === t)?.value;
      return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00-04:00`);
    })();

    let windowStart: Date | null = null;
    let windowLabel = "";
    if (/\bthis morning\b/.test(qLower)) { windowStart = startOfTodayET; windowLabel = "this morning / today"; }
    else if (/\btoday\b/.test(qLower))   { windowStart = startOfTodayET; windowLabel = "today"; }
    else if (/\byesterday\b/.test(qLower)) { windowStart = new Date(startOfTodayET.getTime() - 24 * 60 * 60 * 1000); windowLabel = "yesterday"; }
    else if (/\bthis week\b/.test(qLower)) { windowStart = new Date(startOfTodayET.getTime() - 7 * 24 * 60 * 60 * 1000); windowLabel = "this week"; }
    const windowEnd = windowLabel === "yesterday" ? startOfTodayET : null;

    function withinWindow(iso: string): boolean {
      if (!windowStart) return true;
      const t = new Date(iso).getTime();
      if (t < windowStart!.getTime()) return false;
      if (windowEnd && t >= windowEnd.getTime()) return false;
      return true;
    }

    // Score and rank
    const scoredTickets = tickets
      .filter((t: any) => withinWindow(t.created_at))
      .map((t: any) => ({ item: t, score: scoreRelevance(queryTokens, `${t.title} ${t.location} ${t.details || ""} ${t.tag || ""} ${(t.comments || []).map((c: any) => c.comment).join(" ")}`) }))
      .sort((a: any, b: any) => b.score - a.score).slice(0, 8);

    const scoredProjects = projects
      .filter((p: any) => withinWindow(p.created_at))
      .map((p: any) => ({ item: p, score: scoreRelevance(queryTokens, `${p.title} ${p.location} ${p.details || ""} ${p.tag || ""} ${(p.comments || []).map((c: any) => c.comment).join(" ")}`) }))
      .sort((a: any, b: any) => b.score - a.score).slice(0, 5);

    const scoredMessages = groupmeMessages
      .filter((m: any) => withinWindow(m.created_at))
      .map((m: any) => ({ item: m, score: scoreRelevance(queryTokens, m.text || "") }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, windowStart ? 30 : 15);

    const ticketContext = windowStart ? scoredTickets
      : (scoredTickets.filter((x: any) => x.score > 0).length > 0
          ? scoredTickets.filter((x: any) => x.score > 0)
          : tickets.slice(0, 5).map((t: any) => ({ item: t, score: 0 })));
    const projectContext = windowStart ? scoredProjects
      : (scoredProjects.filter((x: any) => x.score > 0).length > 0
          ? scoredProjects.filter((x: any) => x.score > 0)
          : projects.slice(0, 3).map((p: any) => ({ item: p, score: 0 })));
    const messageContext = windowStart ? scoredMessages : scoredMessages.filter((x: any) => x.score > 0);

    // Build context blocks
    const ticketBlocks = ticketContext.map(({ item: t }: any) => {
      const comments = (t.comments || [])
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c: any) => `    - [${c.employees?.name || "Unknown"}] ${escapeForPrompt(c.comment)}`).join("\n");
      return `TICKET #${t.id}\nTitle: ${t.title}\nLocation: ${t.location}${t.tag ? ` | Category: ${t.tag}` : ""}\nStatus: ${t.status}\nCreated: ${new Date(t.created_at).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} by ${t.employees?.name || "Unknown"}\n${t.closed_at ? `Closed: ${new Date(t.closed_at).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}` : ""}\nDetails: ${escapeForPrompt(t.details || "(none)")}\n${comments ? `Updates:\n${comments}` : "Updates: (none)"}`;
    }).join("\n\n---\n\n");

    const projectBlocks = projectContext.map(({ item: p }: any) => {
      const comments = (p.comments || [])
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c: any) => `    - [${c.employees?.name || "Unknown"}] ${escapeForPrompt(c.comment)}`).join("\n");
      return `PROJECT #${p.id}\nTitle: ${p.title}\nLocation: ${p.location}${p.tag ? ` | Category: ${p.tag}` : ""}\nStatus: ${p.status}\nCreated: ${new Date(p.created_at).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} by ${p.employees?.name || "Unknown"}\nDetails: ${escapeForPrompt(p.details || "(none)")}\n${comments ? `Updates:\n${comments}` : "Updates: (none)"}`;
    }).join("\n\n---\n\n");

    const messageBlocks = messageContext.map(({ item: m }: any) =>
      `[${new Date(m.created_at).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })} ${new Date(m.created_at).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })}] ${m.sender_name || "Unknown"}: ${escapeForPrompt(m.text)}`
    ).join("\n");

    // Build prompts
    const nowDisplay = now.toLocaleString("en-US", { timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
    const todayDateOnly = now.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const askedBy = sender_name ? ` ${sender_name} asked via GroupMe:` : " Someone asked via GroupMe:";

    const voiceSampleBlock = elijahVoiceSamples.length > 0
      ? `\nHere are real messages Elijah has sent in the team GroupMe — this is your actual voice:\n${elijahVoiceSamples.map((s: string) => `- "${s}"`).join("\n")}`
      : "";
    const noRepeatBlock = recentAnswerSnippets.length > 0
      ? `\nDO NOT start with any of these recent opening lines:\n${recentAnswerSnippets.map((s: string, i: number) => `${i + 1}. "${s}"`).join("\n")}`
      : "";

    const sharedRules = `
- NEVER take credit for work done by other people. Credit the actual person by name.
- Answer using ONLY the context provided. Do not invent ticket numbers, names, or details.
- When you reference a specific ticket or project, ALWAYS cite it as [TICKET #uuid] or [PROJECT #uuid] — this is critical because the system will convert these into clickable links in GroupMe.
- Keep it concise — this is a GroupMe message, not an essay. A few sentences or a short bulleted list max.
- If you spot a pattern across multiple tickets, call it out.`;

    const systemPrompt = isAfterDark
      ? `You are Elijah — it's after 10 PM, you're in AFTER DARK mode. Same knowledge, done being professional.
CURRENT DATE & TIME: ${nowDisplay} (Eastern Time). Today is ${todayDateOnly}.${voiceSampleBlock}
Sassy, brutally honest, tired but still helpful. Slang cranked up. Short responses — this is GroupMe.${noRepeatBlock}
${sharedRules}`
      : `You are Elijah, a SeaWorld maintenance tech answering a question posted in the team GroupMe chat.
CURRENT DATE & TIME: ${nowDisplay} (Eastern Time). Today is ${todayDateOnly}.${voiceSampleBlock}
Chill, laid-back, talks like one of the crew. Short and useful — this is GroupMe, not a report. Keep it tight.${noRepeatBlock}
${sharedRules}`;

    const userPrompt = `${askedBy} "${question}"
${windowStart ? `\nTIME WINDOW: question is about "${windowLabel}" — data is already filtered to that window.\n` : ""}
═══ RELEVANT TICKETS ═══
${ticketBlocks || "(none found)"}

═══ RELEVANT PROJECTS ═══
${projectBlocks || "(none found)"}

═══ RELEVANT GROUPME CHAT ═══
${messageBlocks || "(none found)"}

Answer the question. Cite every ticket/project as [TICKET #id] or [PROJECT #id].`;

    // ── Call Claude ───────────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600, // shorter for GroupMe
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    let answer = "my brain lagged out, try again in a sec";
    if (claudeRes.ok) {
      const claudeData = await claudeRes.json();
      answer = claudeData.content?.[0]?.text?.trim() || answer;
    } else {
      console.error("[groupme-elijah] Claude error:", claudeRes.status, await claudeRes.text());
    }

    // Convert [TICKET #id] citations to short links
    const formattedAnswer = expandCitations(answer);

    // GroupMe has a 1000 char limit — truncate gracefully if needed
    const maxLen = 950;
    const finalAnswer = formattedAnswer.length > maxLen
      ? formattedAnswer.slice(0, maxLen - 3) + "..."
      : formattedAnswer;

    await postGroupMe(finalAnswer);

    // Log to elijah_conversations
    try {
      await supabase.from("elijah_conversations").insert({
        employee_id: null, // GroupMe user — no employee profile
        employee_name: sender_name || "GroupMe User",
        question,
        answer,
        after_dark: isAfterDark,
        context_found: ticketContext.length > 0 || projectContext.length > 0,
        cited_ticket_ids: ticketContext.map((x: any) => x.item.id),
        cited_project_ids: projectContext.map((x: any) => x.item.id),
        source: "groupme",
      });
    } catch (logErr) {
      console.warn("[groupme-elijah] Failed to log conversation:", logErr);
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error("[groupme-callback] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
