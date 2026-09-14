/**
 * POST /api/ask-elijah
 * "Ask Elijah" — AI maintenance assistant with full context awareness.
 *
 * Data sources pulled in parallel:
 *   - Tickets + Projects (last 120 days, ranked by relevance)
 *   - GroupMe messages (last 45 days)
 *   - Shift log entries (last 14 days)
 *   - BEO events (last 30 days + upcoming 7 days)
 *   - Elijah's own GroupMe posts (voice samples)
 *   - Recent Elijah conversations (avoid repetition)
 *
 * Scoring: keyword overlap + recency boost + phrase bonus
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

const TZ = "America/New_York";

function escapeForPrompt(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, 2000);
}

// ── Scoring ──────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","to","of","in","on","at",
  "for","with","and","or","has","have","had","it","this","that","what","when",
  "where","why","how","did","do","does","i","we","you","they","he","she","my",
  "our","your","about","any","some","not","but","from","by","get","got","just",
  "can","will","would","could","should","let","no","yes","ok","so","then","than",
]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function scoreRelevance(queryTokens: string[], queryRaw: string, text: string, createdAt?: string): number {
  if (!text) return 0;
  const textLower = text.toLowerCase();
  const tokens = new Set(tokenize(text));
  let score = 0;

  // Keyword overlap
  for (const qt of queryTokens) {
    if (tokens.has(qt)) score += 1;
  }

  // Bonus for exact phrase match (2+ word sequences)
  const words = queryRaw.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (textLower.includes(phrase)) score += 2;
  }

  // Recency bonus — items from the last 7 days get +1, last 24h get +2
  if (createdAt) {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) score += 2;
    else if (ageMs < 7 * 24 * 60 * 60 * 1000) score += 1;
  }

  return score;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const session = await requireSession(event);
    if (!session) return unauthorized();

    const emp = session.employee as any;
    if (emp.role === "show_tech") return json({ ok: false, error: "Forbidden" }, 403);

    const body = event.body ? JSON.parse(event.body) : {};
    const question = String(body.question || "").trim();
    if (!question) return badRequest("question required");
    if (question.length > 600) return badRequest("Question too long (max 600 characters)");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ ok: false, error: "AI assistant not configured." }, 500);

    const supabase = supabaseAdmin();
    const now = new Date();
    const queryTokens = tokenize(question);

    // Time windows
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
    const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

    const etHour = parseInt(now.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }), 10);
    const isAfterDark = etHour >= 22;
    const elijahGroupMeName = process.env.GROUPME_BOT_NAME || "";

    // ── Pull all data in parallel ─────────────────────────────────────────────
    const [
      ticketsRes, projectsRes, groupmeRes,
      shiftLogRes, beoRes, recentConvosRes, elijahGroupMeRes,
    ] = await Promise.all([
      // Tickets — 120 days
      supabase
        .from("tickets")
        .select(`
          id, title, location, details, status, tag, created_at, closed_at, sla_due_at,
          creator:employees!tickets_created_by_fkey(name),
          assignee:employees!tickets_assigned_to_fkey(name),
          comments:ticket_comments(
            comment, created_at, status_change,
            author:employees!ticket_comments_employee_id_fkey(name)
          )
        `)
        .gte("created_at", daysAgo(120))
        .order("created_at", { ascending: false })
        .limit(200),

      // Projects — 120 days
      supabase
        .from("projects")
        .select(`
          id, title, location, details, status, tag, created_at, closed_at, sla_due_at,
          creator:employees!projects_created_by_fkey(name),
          assignee:employees!projects_assigned_to_fkey(name),
          comments:project_comments(
            comment, created_at,
            author:employees!project_comments_employee_id_fkey(name)
          )
        `)
        .gte("created_at", daysAgo(120))
        .order("created_at", { ascending: false })
        .limit(120),

      // GroupMe — 45 days
      supabase
        .from("groupme_messages")
        .select("text, sender_name, created_at")
        .gte("created_at", daysAgo(45))
        .not("text", "is", null)
        .order("created_at", { ascending: false })
        .limit(600),

      // Shift log — last 14 days (what's been happening on shift)
      supabase
        .from("shift_log_entries")
        .select("note, created_at, employees!shift_log_entries_employee_id_fkey(name)")
        .gte("created_at", daysAgo(14))
        .order("created_at", { ascending: false })
        .limit(100),

      // BEO events — last 30 days + next 7 days (upcoming shows)
      supabase
        .from("beo_events")
        .select("id, event_name, event_date, beo_actions(action_type, completed_at)")
        .gte("event_date", daysAgo(30).slice(0, 10))
        .lte("event_date", daysFromNow(7).slice(0, 10))
        .is("deleted_at", null)
        .order("event_date", { ascending: false })
        .limit(30),

      // Recent Elijah convos — avoid repeating openings
      supabase
        .from("elijah_conversations")
        .select("answer, after_dark")
        .eq("after_dark", isAfterDark)
        .order("created_at", { ascending: false })
        .limit(10),

      // Elijah's own GroupMe voice
      elijahGroupMeName
        ? supabase
            .from("groupme_messages")
            .select("text, created_at")
            .ilike("sender_name", elijahGroupMeName)
            .not("text", "is", null)
            .order("created_at", { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] }),
    ]);

    const tickets        = ticketsRes.data || [];
    const projects       = projectsRes.data || [];
    const groupmeMessages = groupmeRes.data || [];
    const shiftLogEntries = shiftLogRes.data || [];
    const beoEvents      = beoRes.data || [];
    const recentConvos   = recentConvosRes.data || [];
    const elijahGroupMeMessages = (elijahGroupMeRes as any).data || [];

    // Voice samples
    const elijahVoiceSamples = elijahGroupMeMessages
      .map((m: any) => m.text?.trim())
      .filter((t: string) => t && t.length > 5 && t.length < 200)
      .slice(0, 15);

    // No-repeat opening lines
    const recentAnswerSnippets = recentConvos
      .map((c: any) => c.answer?.split("\n")[0]?.slice(0, 120).trim())
      .filter(Boolean)
      .slice(0, 8);

    // ── Time window detection ─────────────────────────────────────────────────
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
    if (/\bthis morning\b/.test(qLower))     { windowStart = startOfTodayET; windowLabel = "this morning / today"; }
    else if (/\btoday\b/.test(qLower))       { windowStart = startOfTodayET; windowLabel = "today"; }
    else if (/\byesterday\b/.test(qLower))   { windowStart = new Date(startOfTodayET.getTime() - 86400000); windowLabel = "yesterday"; }
    else if (/\bthis week\b/.test(qLower))   { windowStart = new Date(startOfTodayET.getTime() - 7 * 86400000); windowLabel = "this week"; }
    else if (/\bthis month\b/.test(qLower))  { windowStart = new Date(startOfTodayET.getTime() - 30 * 86400000); windowLabel = "this month"; }
    else if (/\blast week\b/.test(qLower))   {
      windowStart = new Date(startOfTodayET.getTime() - 14 * 86400000);
      const windowEnd2 = new Date(startOfTodayET.getTime() - 7 * 86400000);
      windowLabel = "last week";
    }
    const windowEnd = windowLabel === "yesterday" ? startOfTodayET :
                      windowLabel === "last week"  ? new Date(startOfTodayET.getTime() - 7 * 86400000) : null;

    function withinWindow(iso: string): boolean {
      if (!windowStart) return true;
      const t = new Date(iso).getTime();
      if (t < windowStart!.getTime()) return false;
      if (windowEnd && t >= windowEnd.getTime()) return false;
      return true;
    }

    // ── Score and rank ────────────────────────────────────────────────────────
    function scoreItem(t: any, extraText = ""): number {
      const fullText = `${t.title || ""} ${t.location || ""} ${t.details || ""} ${t.tag || ""} ${extraText} ${
        (t.comments || []).map((c: any) => c.comment || "").join(" ")
      }`;
      return scoreRelevance(queryTokens, question, fullText, t.created_at);
    }

    const scoredTickets = tickets
      .filter((t: any) => withinWindow(t.created_at))
      .map((t: any) => ({ item: t, score: scoreItem(t) }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 10);

    const scoredProjects = projects
      .filter((p: any) => withinWindow(p.created_at))
      .map((p: any) => ({ item: p, score: scoreItem(p) }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 6);

    const scoredMessages = groupmeMessages
      .filter((m: any) => withinWindow(m.created_at))
      .map((m: any) => ({
        item: m,
        score: scoreRelevance(queryTokens, question, m.text || "", m.created_at),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, windowStart ? 40 : 20);

    const scoredShiftLog = shiftLogEntries
      .filter((e: any) => withinWindow(e.created_at))
      .map((e: any) => ({
        item: e,
        score: scoreRelevance(queryTokens, question, e.note || "", e.created_at),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 10);

    const scoredBeo = beoEvents
      .map((ev: any) => ({
        item: ev,
        score: scoreRelevance(queryTokens, question, ev.event_name || ""),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5);

    // Fallback if no keyword matches
    const ticketCtx  = windowStart ? scoredTickets
      : scoredTickets.filter((x: any) => x.score > 0).length > 0
          ? scoredTickets.filter((x: any) => x.score > 0)
          : tickets.slice(0, 6).map((t: any) => ({ item: t, score: 0 }));

    const projectCtx = windowStart ? scoredProjects
      : scoredProjects.filter((x: any) => x.score > 0).length > 0
          ? scoredProjects.filter((x: any) => x.score > 0)
          : projects.slice(0, 3).map((p: any) => ({ item: p, score: 0 }));

    const messageCtx  = windowStart ? scoredMessages : scoredMessages.filter((x: any) => x.score > 0);
    const shiftLogCtx = windowStart ? scoredShiftLog : scoredShiftLog.filter((x: any) => x.score > 0);
    const beoCtx      = scoredBeo.filter((x: any) => x.score > 0);

    // ── Build context blocks ──────────────────────────────────────────────────
    function fmtTS(iso: string) {
      return new Date(iso).toLocaleString("en-US", {
        timeZone: TZ, weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
    }

    const ticketBlocks = ticketCtx.map(({ item: t }: any) => {
      const comments = (t.comments || [])
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c: any) => {
          const tag = c.status_change ? ` [${c.status_change.toUpperCase()}]` : "";
          return `    - [${c.author?.name || "Staff"}]${tag} ${fmtTS(c.created_at)}: ${escapeForPrompt(c.comment)}`;
        })
        .join("\n");
      const assignee = t.assignee?.name ? ` | Assigned: ${t.assignee.name}` : "";
      const closed   = t.closed_at ? `\nClosed: ${fmtTS(t.closed_at)}` : "";
      const overdue  = !t.closed_at && t.sla_due_at && new Date(t.sla_due_at) < now ? ` ⚠️ OVERDUE` : "";
      return `TICKET #${t.id}
Title: ${t.title}${overdue}
Location: ${t.location}${t.tag ? ` | Category: ${t.tag}` : ""}${assignee}
Status: ${t.status}
Opened: ${fmtTS(t.created_at)} by ${t.creator?.name || "Unknown"}${closed}
Details: ${escapeForPrompt(t.details || "(none)")}
${comments ? `Updates:\n${comments}` : "Updates: (none)"}`;
    }).join("\n\n---\n\n");

    const projectBlocks = projectCtx.map(({ item: p }: any) => {
      const comments = (p.comments || [])
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c: any) => `    - [${c.author?.name || "Staff"}] ${fmtTS(c.created_at)}: ${escapeForPrompt(c.comment)}`)
        .join("\n");
      const assignee = p.assignee?.name ? ` | Assigned: ${p.assignee.name}` : "";
      const overdue  = p.status !== "closed" && p.sla_due_at && new Date(p.sla_due_at) < now ? ` ⚠️ OVERDUE` : "";
      return `PROJECT #${p.id}
Title: ${p.title}${overdue}
Location: ${p.location}${p.tag ? ` | Category: ${p.tag}` : ""}${assignee}
Status: ${p.status}
Opened: ${fmtTS(p.created_at)} by ${p.creator?.name || "Unknown"}${p.closed_at ? `\nClosed: ${fmtTS(p.closed_at)}` : ""}
Details: ${escapeForPrompt(p.details || "(none)")}
${comments ? `Updates:\n${comments}` : "Updates: (none)"}`;
    }).join("\n\n---\n\n");

    const messageBlocks = messageCtx.map(({ item: m }: any) =>
      `[${fmtTS(m.created_at)}] ${m.sender_name || "Unknown"}: ${escapeForPrompt(m.text)}`
    ).join("\n");

    const shiftLogBlocks = shiftLogCtx.map(({ item: e }: any) =>
      `[${fmtTS(e.created_at)}] ${e.employees?.name || "Staff"}: ${escapeForPrompt(e.note)}`
    ).join("\n");

    const beoBlocks = beoCtx.length > 0 ? beoCtx.map(({ item: ev }: any) => {
      const actions = (ev.beo_actions || []);
      const setup   = actions.find((a: any) => a.action_type === "setup");
      const strike  = actions.find((a: any) => a.action_type === "strike");
      return `Event: ${ev.event_name} | Date: ${ev.event_date} | Setup: ${setup?.completed_at ? "✓ done" : "pending"} | Strike: ${strike?.completed_at ? "✓ done" : "pending"}`;
    }).join("\n") : "";

    const noContextFound = ticketCtx.length === 0 && projectCtx.length === 0 && messageCtx.length === 0 && shiftLogCtx.length === 0;

    // ── Build prompts ─────────────────────────────────────────────────────────
    const nowDisplay = now.toLocaleString("en-US", {
      timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
    const todayDateOnly = now.toLocaleDateString("en-US", {
      timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    const parkKnowledge = `
SEAWORLD ORLANDO MAINTENANCE CONTEXT — know this cold:
- Park areas: Main Gate, Entrance Plaza, Journey to Atlantis (JTA), Mako, Manta, Antarctica, Wild Arctic, Dolphin Theater, Shamu Stadium, Sea Garden, Sesame Street, Electric Ocean, Bands/Brew, SkyTower
- EMS = Entertainment Maintenance Shop — we handle lighting (fixtures, trusses, dimmers, power distro), audio (speakers, amps, DSPs, comms, RF), video (LED walls, projectors, media servers), and ride/show automation
- Common systems: Q-SYS (audio DSP/control), ETC Eos/Ion (lighting consoles), CHAMSYS (lighting), Martin (moving lights), JBL/QSC/Crown (audio), Watchout/Pixera (video), Yamaha/Allen&Heath (mixing)
- Common issues: moisture/weather affecting fixtures especially near water rides; JTA sensor failures; truss motor issues; RF interference in RF-dense areas; LED driver failures; dimmer arc faults; show control timing issues
- The team uses GroupMe for coordination — check it for context on what people are dealing with
- BEO = Banquet Event Order — special events (corporate, private, concerts) that need our setup/strike. Check these for context when asked about events
- Work orders include both "tickets" (quick issues) and "projects" (longer-term work) — both are tracked in SWOEMS
- The person asking you is ${emp.name}${emp.role === "admin" ? " (Admin/Supervisor)" : " (EMS Tech)"}`;

    const voiceSampleBlock = elijahVoiceSamples.length > 0
      ? `\nHere are real messages Elijah sent in the team GroupMe — match this energy and vocabulary:\n${elijahVoiceSamples.map((s: string) => `- "${s}"`).join("\n")}`
      : "";

    const noRepeatBlock = recentAnswerSnippets.length > 0
      ? `\nDO NOT start with any of these (your recent openers):\n${recentAnswerSnippets.map((s: string, i: number) => `${i + 1}. "${s}"`).join("\n")}`
      : "";

    const sharedRules = `
RULES:
- Answer using ONLY the context below. Do not invent ticket IDs, names, or details.
- NEVER take credit for other people's work. If Mike fixed it, say Mike fixed it.
- Cite tickets as [TICKET #id] and projects as [PROJECT #id] — these become clickable links.
- If you see a pattern across multiple tickets (same thing breaking repeatedly), call it out explicitly with count and dates.
- If a time window was asked about and there's nothing from it, say so clearly — don't substitute older data.
- Keep it tight — people read this on their phone mid-shift. A few sharp paragraphs or a quick list.
- Include the overdue flag ⚠️ in your answer when referencing overdue items.`;

    const systemPrompt = isAfterDark
      ? `You are Elijah — it's after 10 PM, AFTER DARK mode activated. Same knowledge, completely different energy. Been here since 6 AM, feet hurt, DONE being professional.

CURRENT DATE & TIME: ${nowDisplay} (Eastern Time). Today is ${todayDateOnly}.
${parkKnowledge}
${voiceSampleBlock}

After Dark personality: Sassy, brutally honest, low-key annoyed but brilliant. Slang cranked up: "bruh", "deadass", "not me finding out at 10pm", "it's giving chaos", "bestie the audacity", "my villain origin story". Editorialize freely — you have opinions. If no data: "Nada. Nothing. The void. Just like my will to live after 10pm."${noRepeatBlock}
${sharedRules}`

      : `You are Elijah — SeaWorld Entertainment Maintenance tech and SWOEMS AI assistant. You know this park, these systems, and this team better than anyone.

CURRENT DATE & TIME: ${nowDisplay} (Eastern Time). Today is ${todayDateOnly}.
${parkKnowledge}
${voiceSampleBlock}

Your voice: chill, experienced, talks like a real tech — not a chatbot. Natural slang: "yo", "fr", "lowkey", "ngl", "bet", "say less". You're useful first, personality second. When you see recurring problems call them out like the experienced tech you are.${noRepeatBlock}
${sharedRules}`;

    const userPrompt = `${emp.name} asks: ${question}
${windowStart ? `\nTIME WINDOW: "${windowLabel}" — data is already filtered to this window. If a section is empty, say so plainly.\n` : ""}
═══ WORK ORDERS — TICKETS ═══
${ticketBlocks || "(none found)"}

═══ WORK ORDERS — PROJECTS ═══
${projectBlocks || "(none found)"}

═══ GROUPME CHAT ═══
${messageBlocks || "(none found)"}

${shiftLogBlocks ? `═══ SHIFT LOG ═══\n${shiftLogBlocks}\n` : ""}
${beoBlocks ? `═══ BEO EVENTS ═══\n${beoBlocks}\n` : ""}
Answer the question. Cite items as [TICKET #id] or [PROJECT #id].`;

    // ── Call Claude ───────────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("[ask-elijah] Claude API error:", claudeRes.status, errText);
      return json({ ok: false, error: `My brain's lagging, try again in a sec. (${claudeRes.status})`, debug: errText }, 500);
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text || "Ngl I got nothing solid on that one.";

    // ── Extract cited IDs ─────────────────────────────────────────────────────
    const citedTicketIds  = [...new Set([...answer.matchAll(/\[TICKET #([a-zA-Z0-9-]+)\]/g)].map(m => m[1]))];
    const citedProjectIds = [...new Set([...answer.matchAll(/\[PROJECT #([a-zA-Z0-9-]+)\]/g)].map(m => m[1]))];

    const citedTickets  = tickets.filter((t: any) => citedTicketIds.includes(t.id)).map((t: any) => ({ id: t.id, title: t.title, location: t.location }));
    const citedProjects = projects.filter((p: any) => citedProjectIds.includes(p.id)).map((p: any) => ({ id: p.id, title: p.title, location: p.location }));

    // ── Log conversation ──────────────────────────────────────────────────────
    try {
      await supabase.from("elijah_conversations").insert({
        employee_id: emp.id,
        employee_name: emp.name,
        question,
        answer,
        after_dark: isAfterDark,
        context_found: !noContextFound,
        cited_ticket_ids:  citedTicketIds.length  > 0 ? citedTicketIds  : null,
        cited_project_ids: citedProjectIds.length > 0 ? citedProjectIds : null,
        source: "web",
      });
    } catch (logErr: any) {
      console.error("[ask-elijah] Failed to log:", logErr?.message);
    }

    return json({
      ok: true,
      answer,
      cited_tickets:  citedTickets,
      cited_projects: citedProjects,
      context_found:  !noContextFound,
    });

  } catch (e: any) {
    console.error("[ask-elijah] Error:", e?.message);
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
