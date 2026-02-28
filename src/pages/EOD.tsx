import React, { useEffect, useMemo, useState } from "react";
import { sendEod, listTickets, listProjects } from "../lib/api";

const TAGS = ["Lighting", "Sound", "Video", "Rides", "Misc"] as const;
type Tag = typeof TAGS[number];

function parseDate(v: any): number {
  const ms = Date.parse(v || "");
  return Number.isFinite(ms) ? ms : 0;
}

function isToday(v: any): boolean {
  const ms = parseDate(v);
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function fmtTime(v: any): string {
  const ms = parseDate(v);
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function isClosed(item: any): boolean {
  const s = (item?.status || "").toLowerCase();
  return s === "closed" || s === "done" || !!item?.closed_at || !!item?.closedAt;
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Lighting: { bg: "rgba(255,182,39,0.12)", text: "#FFD07A" },
  Sound:    { bg: "rgba(92,107,255,0.13)", text: "#A8B0FF" },
  Video:    { bg: "rgba(46,232,160,0.1)", text: "#7EEFC4" },
  Rides:    { bg: "rgba(255,84,84,0.12)", text: "#FFB0B0" },
  Misc:     { bg: "rgba(255,255,255,0.07)", text: "rgba(200,210,255,0.75)" },
};

function TagBadge({ tag }: { tag: string }) {
  const colors = TAG_COLORS[tag] || TAG_COLORS.Misc;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: colors.bg, color: colors.text,
    }}>
      {tag}
    </span>
  );
}

function StatusDot({ closed }: { closed: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 5, flexShrink: 0,
      background: closed ? "rgba(255,255,255,0.2)" : "#2EE8A0",
      boxShadow: closed ? "none" : "0 0 6px rgba(46,232,160,0.6)",
    }} />
  );
}

export default function EOD() {
  const [notes, setNotes] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Live data
  const [tickets, setTickets] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Active tag filter (null = all)
  const [activeTag, setActiveTag] = useState<Tag | null>(null);

  useEffect(() => {
    async function load() {
      setDataLoading(true);
      try {
        const [tr, pr] = await Promise.all([
          listTickets({ includeClosed: true }),
          listProjects({ includeClosed: true }),
        ]);
        // Filter to items active today
        const todayTickets = (tr.ok ? (tr.data as any)?.tickets || [] : []).filter(
          (t: any) => isToday(t.created_at) || isToday(t.closed_at) || isToday(t.updated_at)
        );
        const todayProjects = (pr.ok ? (pr.data as any)?.projects || [] : []).filter(
          (p: any) => isToday(p.created_at) || isToday(p.closed_at) || isToday(p.updated_at)
        );
        setTickets(todayTickets);
        setProjects(todayProjects);
      } catch {}
      setDataLoading(false);
    }
    void load();
  }, []);

  // Group by tag
  const grouped = useMemo(() => {
    const result: Record<string, { tickets: any[]; projects: any[] }> = {};
    for (const tag of TAGS) result[tag] = { tickets: [], projects: [] };

    for (const t of tickets) {
      const tag = (t.tag || "Misc") as Tag;
      if (result[tag]) result[tag].tickets.push(t);
      else result["Misc"].tickets.push(t);
    }
    for (const p of projects) {
      const tag = (p.tag || "Misc") as Tag;
      if (result[tag]) result[tag].projects.push(p);
      else result["Misc"].projects.push(p);
    }
    return result;
  }, [tickets, projects]);

  const activeTags = TAGS.filter(t => grouped[t].tickets.length + grouped[t].projects.length > 0);

  const totalItems = tickets.length + projects.length;
  const closedCount = [...tickets, ...projects].filter(isClosed).length;
  const openCount = totalItems - closedCount;

  async function onSend() {
    setStatus(null);
    setBusy(true);
    try {
      const res: any = await sendEod({ notes, handoff_notes: handoffNotes });
      if (!res?.ok) throw new Error(res?.error || "Failed to send");
      setStatus({ ok: true, msg: `Report emailed. Covered ${res.data?.ticket_count ?? tickets.length} tickets and ${res.data?.project_count ?? projects.length} projects.` });
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message || "Failed to send EOD" });
    } finally {
      setBusy(false);
    }
  }

  const displayTags = activeTag ? [activeTag] : activeTags;

  return (
    <div className="page fade-up">
      <div className="page-title">End of Day</div>
      <div className="page-subtitle">
        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      </div>

      {/* Summary stats */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 12, display: "flex", gap: 0 }}>
        {[
          { label: "Today's Items", value: dataLoading ? "…" : totalItems, color: "var(--text)" },
          { label: "Open", value: dataLoading ? "…" : openCount, color: "#FFD07A" },
          { label: "Closed", value: dataLoading ? "…" : closedCount, color: "#7EEFC4" },
        ].map((stat, i, arr) => (
          <div key={stat.label} style={{
            flex: 1, textAlign: "center",
            borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none",
            padding: "2px 0",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, lineHeight: 1.2 }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: "var(--muted2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tag filter */}
      {activeTags.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <button
            onClick={() => setActiveTag(null)}
            style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "1px solid",
              borderColor: activeTag === null ? "rgba(92,107,255,0.4)" : "var(--border)",
              background: activeTag === null ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
              color: activeTag === null ? "#B0B8FF" : "var(--muted)",
            }}
          >
            All tags
          </button>
          {activeTags.map(tag => {
            const colors = TAG_COLORS[tag] || TAG_COLORS.Misc;
            const isActive = activeTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(isActive ? null : tag)}
                style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1px solid`,
                  borderColor: isActive ? colors.text + "66" : "var(--border)",
                  background: isActive ? colors.bg : "rgba(255,255,255,0.05)",
                  color: isActive ? colors.text : "var(--muted)",
                }}
              >
                {tag} <span style={{ opacity: 0.7 }}>({grouped[tag].tickets.length + grouped[tag].projects.length})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Activity preview by tag */}
      {dataLoading ? (
        <div className="card" style={{ padding: "24px 16px", textAlign: "center" }}>
          <span className="spinner" style={{ margin: "0 auto 10px", display: "block" }} />
          <div className="muted" style={{ fontSize: 13 }}>Loading today's activity…</div>
        </div>
      ) : activeTags.length === 0 ? (
        <div className="card" style={{ padding: "24px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🌙</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>No tickets or projects logged today.</div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {displayTags.map(tag => {
            const group = grouped[tag];
            if (group.tickets.length + group.projects.length === 0) return null;
            const colors = TAG_COLORS[tag] || TAG_COLORS.Misc;

            return (
              <div key={tag} style={{ marginBottom: 12 }}>
                {/* Tag header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <TagBadge tag={tag} />
                  <span style={{ fontSize: 12, color: "var(--muted2)" }}>
                    {group.tickets.length + group.projects.length} item{group.tickets.length + group.projects.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="cards">
                  {group.tickets.map((t: any) => (
                    <div key={t.id} className="card" style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                            <StatusDot closed={isClosed(t)} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{t.title || "Untitled"}</span>
                          </div>
                          {t.location && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>📍 {t.location}</div>}
                          <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                            Ticket · {fmtTime(t.created_at)}
                            {t.created_by_name ? ` · ${t.created_by_name}` : ""}
                          </div>
                        </div>
                        <span className={`chip ${isClosed(t) ? "neutral" : "success"}`}>
                          {isClosed(t) ? "Closed" : "Open"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {group.projects.map((p: any) => (
                    <div key={p.id} className="card" style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                            <StatusDot closed={isClosed(p)} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{p.title || "Untitled"}</span>
                          </div>
                          {p.location && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>📍 {p.location}</div>}
                          <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                            Project · {fmtTime(p.created_at)}
                            {p.created_by_name ? ` · ${p.created_by_name}` : ""}
                          </div>
                        </div>
                        <span className={`chip ${isClosed(p) ? "neutral" : "warn"}`}>
                          {isClosed(p) ? "Closed" : "Open"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notes form */}
      <div className="card" style={{ padding: "16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted2)", marginBottom: 12 }}>
          Add to Report
        </div>

        <label>
          <div className="field-label">Operator Notes</div>
          <textarea
            className="textarea"
            style={{ minHeight: 80 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened today? Notable incidents, maintenance, observations…"
          />
        </label>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Handoff Notes</div>
          <textarea
            className="textarea"
            style={{ minHeight: 80 }}
            value={handoffNotes}
            onChange={(e) => setHandoffNotes(e.target.value)}
            placeholder="What does the next shift need to know?"
          />
        </label>

        {status && (
          <div style={{
            marginTop: 12, padding: "10px 13px", borderRadius: 10, fontSize: 13,
            background: status.ok ? "var(--success-bg)" : "var(--danger-bg)",
            color: status.ok ? "#7EEFC4" : "#FFB0B0",
            border: `1px solid ${status.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}`,
          }}>
            {status.ok ? "✓ " : "⚠ "}{status.msg}
          </div>
        )}

        <button
          className="btn primary full"
          style={{ marginTop: 14 }}
          onClick={onSend}
          disabled={busy}
        >
          {busy ? <><span className="spinner" /> Sending report…</> : `Send EOD report${totalItems > 0 ? ` (${totalItems} items)` : ""}`}
        </button>
      </div>
    </div>
  );
}
