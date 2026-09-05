import React, { useEffect, useRef, useState } from "react";

const REFRESH_MS = 60_000;
const TZ = "America/New_York";

const TAG_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  Lighting: { bg: "rgba(129,140,248,0.18)", text: "#a5b4fc", bar: "#818cf8" },
  Sound:    { bg: "rgba(52,211,153,0.18)",  text: "#6ee7b7", bar: "#34d399" },
  Video:    { bg: "rgba(251,191,36,0.18)",  text: "#fcd34d", bar: "#fbbf24" },
  Rides:    { bg: "rgba(248,113,113,0.18)", text: "#fca5a5", bar: "#f87171" },
  Misc:     { bg: "rgba(156,163,175,0.18)", text: "#d1d5db", bar: "#9ca3af" },
};
const TAG_ORDER = ["Lighting", "Sound", "Video", "Rides", "Misc"];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
}
function fmtFull(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function nowDisplay() {
  return new Date().toLocaleString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
}
function fmtShift(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`;
}

async function fetchDashboard() {
  const res = await fetch("/api/office-dashboard");
  return res.json();
}

// ── Ticket Detail Modal ───────────────────────────────────────────────────────
function TicketModal({ ticket, onClose, isClosed }: { ticket: any; onClose: () => void; isClosed?: boolean }) {
  const tag = ticket.tag || "Misc";
  const tc = TAG_COLORS[tag] || TAG_COLORS.Misc;
  const photos: any[] = ticket.photos || [];
  const comments: any[] = ticket.comments || [];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0f1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16,
        width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#f3f4f6", lineHeight: 1.3, marginBottom: 4 }}>{ticket.title}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {ticket.location && <span>📍 {ticket.location}</span>}
                {ticket.assigned_name && <span style={{ marginLeft: 8 }}>· {ticket.assigned_name}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#9ca3af", fontSize: 16, width: 32, height: 32, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 99, background: tc.bg, color: tc.text }}>{tag}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 99,
              background: isClosed ? "rgba(52,211,153,0.15)" : ticket.is_overdue ? "rgba(248,113,113,0.15)" : "rgba(52,211,153,0.1)",
              color: isClosed ? "#6ee7b7" : ticket.is_overdue ? "#f87171" : "#6ee7b7" }}>
              {isClosed ? "✓ Closed" : ticket.is_overdue ? "OVERDUE" : `${ticket.hours_left}h remaining`}
            </span>
            {!isClosed && ticket.sla_due_at && (
              <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 99, background: "rgba(255,255,255,0.06)", color: "#6b7280" }}>
                Due {fmtFull(ticket.sla_due_at)}
              </span>
            )}
            {isClosed && ticket.closed_at && (
              <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 99, background: "rgba(255,255,255,0.06)", color: "#6b7280" }}>
                Closed {fmtFull(ticket.closed_at)}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Description */}
          {ticket.details && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: 6 }}>Description</div>
              <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.65, whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
                {ticket.details}
              </div>
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: 8 }}>Photos ({photos.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {photos.map((p: any, i: number) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", aspectRatio: "4/3" }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          {comments.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: 8 }}>Updates ({comments.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {comments.map((c: any) => (
                  <div key={c.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#c7d2fe" }}>{c.employee_name}</span>
                      <span style={{ fontSize: 10, color: "#4b5563" }}>{fmtFull(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.comment}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {comments.length === 0 && !ticket.details && !photos.length && (
            <div style={{ fontSize: 13, color: "#4b5563", textAlign: "center", padding: "20px 0" }}>No additional details</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, background: "rgba(251,191,36,0.06)", borderRadius: "0 0 16px 16px" }}>
          <div style={{ fontSize: 11, color: "#fcd34d", textAlign: "center" }}>
            📱 To add an update, log in to <strong>swoems.com</strong> on your mobile device
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function OfficeDashboard() {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock]     = useState(nowDisplay());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [selectedIsClosed, setSelectedIsClosed] = useState(false);
  const timerRef = useRef<any>(null);
  const clockRef = useRef<any>(null);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), REFRESH_MS);
    clockRef.current = setInterval(() => setClock(nowDisplay()), 1000);
    return () => { clearInterval(timerRef.current); clearInterval(clockRef.current); };
  }, []);

  async function load() {
    try {
      const res = await fetchDashboard();
      if (res.ok) {
        setData(res);
        setLastUpdated(new Date().toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }));
      }
    } catch {} finally { setLoading(false); }
  }

  function openTicket(ticket: any, isClosed = false) {
    setSelectedTicket(ticket);
    setSelectedIsClosed(isClosed);
  }

  const stats        = data?.stats || {};
  const groupme      = data?.groupme || [];
  const closedToday  = data?.closed_today || [];
  const shiftLog     = data?.shift_log || [];
  const schedule     = data?.schedule || [];
  const needsUpdate  = data?.needs_update || [];
  const tagBreakdown = stats.tag_breakdown || {};
  const totalOpen    = stats.open || 0;
  const beoEvents    = data?.beo_events || [];

  // Shift log add form state
  const [logNote, setLogNote] = useState("");
  const [logSaving, setLogSaving] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  async function submitShiftLog(e: React.FormEvent) {
    e.preventDefault();
    const note = logNote.trim();
    if (!note) return;
    setLogSaving(true);
    setLogError(null);
    try {
      const res = await fetch("/api/dashboard-shift-log-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to save");
      setLogNote("");
      // Optimistically prepend the new entry
      if (json.entry) {
        setData((prev: any) => prev ? {
          ...prev,
          shift_log: [json.entry, ...(prev.shift_log || [])],
        } : prev);
      }
    } catch (err: any) {
      setLogError(err?.message || "Failed to save");
    } finally {
      setLogSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#06080f", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, background: "rgba(0,0,0,0.55)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: "10px 18px", borderRight: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em", color: "#f3f4f6" }}>🔧 SWOEMS</div>
          <div style={{ fontSize: 9, color: "#4b5563" }}>SeaWorld Maintenance</div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 0, flex: 1, borderRight: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { label: "Open Work Orders", value: stats.open ?? "—", color: "#818cf8", sub: `${stats.opened_today ?? 0} new today` },
            { label: "Overdue", value: stats.overdue ?? "—", color: stats.overdue > 0 ? "#f87171" : "#34d399", sub: stats.overdue > 0 ? "Past due" : "All on track", warn: stats.overdue > 0 },
            { label: "Closed Today", value: stats.closed_today ?? "—", color: "#34d399", sub: "Completed" },
            { label: "Avg Staleness", value: `${stats.avg_age_days ?? "—"}d`, color: "#9ca3af", sub: "Avg days since update" },
          ].map(s => (
            <div key={s.label} style={{ padding: "8px 16px", borderRight: "1px solid rgba(255,255,255,0.05)", background: (s as any).warn ? "rgba(248,113,113,0.06)" : "transparent" }}>
              <div style={{ fontSize: 9, color: (s as any).warn ? "#f87171" : "#4b5563", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: "-0.03em" }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "#374151" }}>{s.sub}</div>
            </div>
          ))}

          {/* Tag breakdown */}
          <div style={{ padding: "8px 14px", flex: 1 }}>
            <div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 5 }}>By Category</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {TAG_ORDER.filter(t => tagBreakdown[t]).map(tag => {
                const count = tagBreakdown[tag] || 0;
                const pct = totalOpen > 0 ? (count / totalOpen) * 100 : 0;
                const tc = TAG_COLORS[tag] || TAG_COLORS.Misc;
                return (
                  <div key={tag} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 46, fontSize: 9, color: tc.text, fontWeight: 600 }}>{tag}</div>
                    <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: tc.bar, borderRadius: 3 }} />
                    </div>
                    <div style={{ width: 14, fontSize: 9, color: "#6b7280", textAlign: "right" }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* On Shift Today */}
        <div style={{ padding: "8px 14px", borderRight: "1px solid rgba(255,255,255,0.07)", minWidth: 180, maxWidth: 260 }}>
          <div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 5 }}>
            📅 On Shift Today ({schedule.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {schedule.length === 0
              ? <span style={{ fontSize: 10, color: "#374151" }}>No schedule uploaded</span>
              : schedule.map((s: any, i: number) => (
                <div key={i} style={{ background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.22)", borderRadius: 6, padding: "3px 8px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#c7d2fe" }}>{s.employee_name}</div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>
                    {s.all_shifts ? "All shifts" : [fmtShift(s.shift_start), fmtShift(s.shift_end)].filter(Boolean).join(" – ")}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Clock */}
        <div style={{ padding: "8px 16px", textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{clock}</div>
          {lastUpdated && <div style={{ fontSize: 9, color: "#374151" }}>Updated {lastUpdated}</div>}
        </div>
      </div>

      {loading && !data ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Loading dashboard…</div>
        </div>
      ) : (
        /* ── MAIN 4-COLUMN GRID ─────────────────────────────────────────── */
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 0, minHeight: 0, overflow: "hidden" }}>

          {/* COL 1: BEO Events + Shift Log — PRIMARY */}
          <div style={{ display: "flex", flexDirection: "column", borderRight: "2px solid rgba(251,191,36,0.2)", overflow: "hidden", background: "rgba(251,191,36,0.02)" }}>

            {/* BEO Events — always shown */}
            <>
              <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid rgba(248,113,113,0.15)", flexShrink: 0, display: "flex", alignItems: "center", gap: 7, background: "rgba(248,113,113,0.05)" }}>
                <span style={{ fontSize: 14 }}>🎪</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5" }}>Events Today</span>
                <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{beoEvents.length} event{beoEvents.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ flexShrink: 0, padding: "6px 12px", borderBottom: "1px solid rgba(251,191,36,0.1)", display: "flex", flexDirection: "column", gap: 5 }}>
                {beoEvents.length === 0 ? (
                  <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.12)", borderRadius: 8, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📋</span>
                    <span style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.4 }}>
                      No events logged — verify via <strong>Outlook</strong> and <strong>Event Binder</strong>
                    </span>
                  </div>
                ) : beoEvents.map((ev: any) => (
                  <div key={ev.id} style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fecaca", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.event_name}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, background: ev.setup_done ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)", color: ev.setup_done ? "#6ee7b7" : "#fcd34d" }}>
                          {ev.setup_done ? "✓ Setup" : "⏳ Setup needed"}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, background: ev.strike_done ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", color: ev.strike_done ? "#6ee7b7" : "#6b7280" }}>
                          {ev.strike_done ? "✓ Strike" : "Strike pending"}
                        </span>
                      </div>
                    </div>
                    {ev.pdf_url && (
                      <a href={ev.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, fontWeight: 600, color: "#818cf8", textDecoration: "none", background: "rgba(129,140,248,0.12)", padding: "3px 8px", borderRadius: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
                        📄 BEO PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </>

            {/* Shift Log header */}
            <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid rgba(251,191,36,0.15)", flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 14 }}>📓</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#fde68a" }}>Shift Log</span>
              <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{shiftLog.length} entries today</span>
            </div>

            {/* Log entries */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
              {shiftLog.length === 0
                ? <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", paddingTop: 20 }}>No shift notes yet today</div>
                : shiftLog.map((e: any) => (
                  <div key={e.id} style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 9, padding: "9px 12px", borderLeft: "3px solid rgba(251,191,36,0.5)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#fde68a" }}>{e.employee_name}</span>
                      <span style={{ fontSize: 9, color: "#6b7280" }}>{fmtTime(e.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {e.note}
                    </div>
                  </div>
                ))}
            </div>

            {/* Add shift log entry */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(251,191,36,0.15)", flexShrink: 0, background: "rgba(0,0,0,0.3)" }}>
              <form onSubmit={submitShiftLog} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <textarea
                  value={logNote}
                  onChange={e => setLogNote(e.target.value)}
                  placeholder="Add a shift note… (posts as EMS Shop Dashboard)"
                  rows={2}
                  style={{
                    width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, color: "#e5e7eb",
                    fontSize: 12, padding: "8px 10px", resize: "none", fontFamily: "inherit",
                    outline: "none",
                  }}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void submitShiftLog(e as any); } }}
                />
                {logError && <div style={{ fontSize: 10, color: "#f87171" }}>⚠ {logError}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#4b5563" }}>Cmd+Enter to submit · Posts as "EMS Shop Dashboard"</span>
                  <button type="submit" disabled={logSaving || !logNote.trim()} style={{
                    background: logSaving || !logNote.trim() ? "rgba(251,191,36,0.15)" : "rgba(251,191,36,0.3)",
                    border: "1px solid rgba(251,191,36,0.3)", borderRadius: 7, color: "#fde68a",
                    fontSize: 11, fontWeight: 700, padding: "5px 14px", cursor: logSaving || !logNote.trim() ? "not-allowed" : "pointer",
                  }}>
                    {logSaving ? "Saving…" : "Log Note"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* COL 2: GroupMe */}
          <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 14 }}>💬</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e5e7eb" }}>GroupMe</span>
              <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{groupme.length} messages</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              {groupme.length === 0
                ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>No recent messages</div>
                : groupme.map((m: any) => (
                  <div key={m.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "7px 9px", borderLeft: "2px solid rgba(129,140,248,0.4)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#c7d2fe" }}>{m.sender}</span>
                      <span style={{ fontSize: 9, color: "#374151" }}>{fmtTime(m.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.45, wordBreak: "break-word" }}>
                      {m.text.length > 160 ? m.text.slice(0, 157) + "…" : m.text}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* COL 3: Needs Update */}
          <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e5e7eb" }}>Needs Update</span>
              <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{needsUpdate.length} stale</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              {needsUpdate.length === 0
                ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>✓ All recently updated</div>
                : needsUpdate.map((t: any) => {
                  const tc = TAG_COLORS[t.tag] || TAG_COLORS.Misc;
                  return (
                    <div key={t.id} onClick={() => openTicket(t, false)}
                      style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px", borderLeft: `3px solid ${t.is_overdue ? "#f87171" : "#f59e0b"}`, cursor: "pointer", transition: "background 0.12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                            {t.location && <span>📍 {t.location}</span>}
                            {t.assigned_name && <span style={{ marginLeft: 5 }}>· {t.assigned_name}</span>}
                          </div>
                          <div style={{ fontSize: 9, color: "#78350f", marginTop: 3 }}>
                            No update for <strong style={{ color: "#fbbf24" }}>{t.days_since_update >= 1 ? `${Math.floor(t.days_since_update)}d` : "< 1d"}</strong>
                            {` · ${t.comment_count} comment${t.comment_count !== 1 ? "s" : ""}`}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 99, background: tc.bg, color: tc.text, display: "block" }}>{t.tag || "Misc"}</span>
                          {t.is_overdue
                            ? <div style={{ fontSize: 9, color: "#f87171", marginTop: 2, fontWeight: 700 }}>OVERDUE</div>
                            : <div style={{ fontSize: 9, color: "#4b5563", marginTop: 2 }}>{t.hours_left > 0 ? `${t.hours_left}h left` : "due soon"}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div style={{ padding: "7px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: "#374151", textAlign: "center" }}>📱 Tap a ticket · Log in at swoems.com to update</div>
            </div>
          </div>

          {/* COL 4: Completed Today */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e5e7eb" }}>Completed Today</span>
              <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{closedToday.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              {closedToday.length === 0
                ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>None completed yet today</div>
                : closedToday.map((t: any) => {
                  const tc = TAG_COLORS[t.tag] || TAG_COLORS.Misc;
                  return (
                    <div key={`${t.type}-${t.id}`} onClick={() => openTicket(t, true)}
                      style={{ background: "rgba(52,211,153,0.05)", borderRadius: 8, padding: "8px 10px", borderLeft: "2px solid rgba(52,211,153,0.4)", cursor: "pointer", transition: "background 0.12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(52,211,153,0.1)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(52,211,153,0.05)")}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#d1fae5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                            {t.location && <span>📍 {t.location}</span>}
                            {t.assigned_name && <span style={{ marginLeft: 5 }}>· {t.assigned_name}</span>}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          {t.tag && <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 99, background: tc.bg, color: tc.text, display: "block" }}>{t.tag}</span>}
                          <div style={{ fontSize: 9, color: "#374151", marginTop: 2 }}>{fmtTime(t.closed_at)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

        </div>
      )}

      {/* ── BOTTOM BAR ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px", background: "rgba(0,0,0,0.6)", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.6)", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 9, color: "#374151" }}>Live · Refreshes every 60s · Click any work order to view details · Updates require mobile login</span>
        </div>
        <span style={{ fontSize: 9, color: "#1f2937" }}>SWOEMS © SeaWorld Entertainment</span>
      </div>

      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
      {selectedTicket && (
        <TicketModal ticket={selectedTicket} isClosed={selectedIsClosed} onClose={() => setSelectedTicket(null)} />
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  );
}
