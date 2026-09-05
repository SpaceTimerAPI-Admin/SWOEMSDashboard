import React, { useEffect, useRef, useState } from "react";

const REFRESH_MS = 60_000;
const TZ = "America/New_York";
const SITE = (typeof window !== "undefined" ? window.location.origin : "https://www.swoems.com");

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Lighting: { bg: "rgba(129,140,248,0.2)", text: "#a5b4fc" },
  Sound:    { bg: "rgba(52,211,153,0.2)",  text: "#6ee7b7" },
  Video:    { bg: "rgba(251,191,36,0.2)",  text: "#fcd34d" },
  Rides:    { bg: "rgba(248,113,113,0.2)", text: "#fca5a5" },
  Misc:     { bg: "rgba(156,163,175,0.2)", text: "#d1d5db" },
};
const TAG_ORDER = ["Lighting", "Sound", "Video", "Rides", "Misc"];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function nowDisplay() {
  return new Date().toLocaleString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
}
function fmtShift(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

async function fetchDashboard() {
  const res = await fetch("/api/office-dashboard");
  return res.json();
}

// ── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, warn }: { label: string; value: any; sub?: string; color: string; warn?: boolean }) {
  return (
    <div style={{ flex: 1, background: warn ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${warn ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, color: warn ? "#f87171" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1.1, letterSpacing: "-0.03em" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ColHeader({ icon, label, count }: { icon: string; label: string; count?: string }) {
  return (
    <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#e5e7eb" }}>{label}</span>
      {count && <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{count}</span>}
    </div>
  );
}

function TicketPill({ t, onClick }: { t: any; onClick: () => void }) {
  const tag = t.tag || "Misc";
  const tc = TAG_COLORS[tag] || TAG_COLORS.Misc;
  return (
    <div onClick={onClick} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px", borderLeft: `3px solid ${t.is_overdue ? "#f87171" : tc.text}`, cursor: "pointer", transition: "background 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
            {t.location && <span>📍 {t.location}</span>}
            {t.assigned_name && <span style={{ marginLeft: 6 }}>· {t.assigned_name}</span>}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: tc.bg, color: tc.text }}>{tag}</span>
          {t.is_overdue
            ? <div style={{ fontSize: 9, color: "#f87171", marginTop: 2, fontWeight: 600 }}>OVERDUE</div>
            : <div style={{ fontSize: 9, color: "#4b5563", marginTop: 2 }}>{t.hours_left > 0 ? `${t.hours_left}h left` : "due soon"}</div>}
        </div>
      </div>
    </div>
  );
}

function TicketModal({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const tag = ticket.tag || "Misc";
  const tc = TAG_COLORS[tag] || TAG_COLORS.Misc;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 24, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e5e7eb", marginBottom: 4 }}>{ticket.title}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {ticket.location && <span>📍 {ticket.location}</span>}
              {ticket.assigned_name && <span style={{ marginLeft: 8 }}>· Assigned: {ticket.assigned_name}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer", marginLeft: 12, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: tc.bg, color: tc.text }}>{tag}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: ticket.is_overdue ? "rgba(248,113,113,0.2)" : "rgba(52,211,153,0.12)", color: ticket.is_overdue ? "#f87171" : "#6ee7b7" }}>
            {ticket.is_overdue ? "OVERDUE" : `${ticket.hours_left}h remaining`}
          </span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}>
            {ticket.comment_count} update{ticket.comment_count !== 1 ? "s" : ""}
          </span>
        </div>
        {ticket.details && (
          <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6, marginBottom: 16, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
            {ticket.details.slice(0, 300)}{ticket.details.length > 300 ? "…" : ""}
          </div>
        )}
        <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#fcd34d" }}>
          📱 To add an update, log in to SWOEMS on your mobile device at <strong>swoems.com</strong>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "#374151", textAlign: "center" }}>
          Ticket ID: {ticket.id}
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function OfficeDashboard() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock]   = useState(nowDisplay());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
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
      if (res.ok) { setData(res); setLastUpdated(new Date().toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })); }
    } catch {} finally { setLoading(false); }
  }

  const stats = data?.stats || {};
  const groupme: any[]      = data?.groupme || [];
  const closedToday: any[]  = data?.closed_today || [];
  const shiftLog: any[]     = data?.shift_log || [];
  const schedule: any[]     = data?.schedule || [];
  const needsUpdate: any[]  = data?.needs_update || [];
  const spotlight: any[]    = data?.spotlight || [];
  const tagBreakdown: Record<string, number> = stats.tag_breakdown || {};
  const totalOpen = stats.open || 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#060912", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 18px", background: "rgba(0,0,0,0.5)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔧</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em" }}>SWOEMS Operations Center</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>SeaWorld Entertainment Maintenance</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{clock}</div>
          {lastUpdated && <div style={{ fontSize: 9, color: "#374151" }}>Refreshed {lastUpdated}</div>}
        </div>
      </div>

      {loading && !data ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Loading…</div>
        </div>
      ) : (
        <>
          {/* ── STAT ROW ───────────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 10, padding: "10px 16px", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, flexWrap: "wrap" }}>
            <StatCard label="Open Work Orders" value={stats.open ?? "—"} color="#818cf8" sub={`${stats.opened_today ?? 0} opened today`} />
            <StatCard label="Overdue" value={stats.overdue ?? "—"} color={stats.overdue > 0 ? "#f87171" : "#34d399"} sub={stats.overdue > 0 ? "Past due date" : "All on track"} warn={stats.overdue > 0} />
            <StatCard label="Unassigned" value={stats.unassigned ?? "—"} color={stats.unassigned > 0 ? "#fbbf24" : "#34d399"} sub="No assignee" warn={stats.unassigned > 2} />
            <StatCard label="Closed Today" value={stats.closed_today ?? "—"} color="#34d399" sub="Resolved this shift" />
            <StatCard label="Avg Age" value={`${stats.avg_age_days ?? "—"}d`} color="#9ca3af" sub="Since last update" />

            {/* Tag breakdown mini bars */}
            <div style={{ flex: 2, minWidth: 180, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 8 }}>By Category</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {TAG_ORDER.filter(t => tagBreakdown[t]).map(tag => {
                  const count = tagBreakdown[tag] || 0;
                  const pct = totalOpen > 0 ? (count / totalOpen) * 100 : 0;
                  const tc = TAG_COLORS[tag] || TAG_COLORS.Misc;
                  return (
                    <div key={tag} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 52, fontSize: 9, color: tc.text, fontWeight: 600 }}>{tag}</div>
                      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: tc.text, borderRadius: 3, transition: "width 0.5s" }} />
                      </div>
                      <div style={{ width: 16, fontSize: 10, color: "#9ca3af", textAlign: "right" }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── MAIN GRID ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr 1fr", gap: 0, minHeight: 0, overflow: "hidden" }}>

            {/* COL 1: GroupMe */}
            <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <ColHeader icon="💬" label="GroupMe Chat" count={`${groupme.length} msgs`} />
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                {groupme.length === 0
                  ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>No recent messages</div>
                  : groupme.map(m => (
                    <div key={m.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "7px 9px", borderLeft: "2px solid rgba(129,140,248,0.4)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#c7d2fe" }}>{m.sender}</span>
                        <span style={{ fontSize: 9, color: "#374151" }}>{fmtTime(m.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4, wordBreak: "break-word" }}>
                        {m.text.length > 140 ? m.text.slice(0, 137) + "…" : m.text}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* COL 2: Today's Schedule + Shift Log */}
            <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
              {/* Schedule — top half */}
              <ColHeader icon="📅" label="On Shift Today" count={`${schedule.length} staff`} />
              <div style={{ flex: "0 0 auto", maxHeight: "38%", overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {schedule.length === 0
                  ? <div style={{ fontSize: 11, color: "#4b5563", padding: "8px 0" }}>No schedule uploaded</div>
                  : schedule.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "5px 8px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb" }}>{s.employee_name}</span>
                      <span style={{ fontSize: 10, color: "#6b7280" }}>
                        {s.all_shifts ? "All shifts" : [fmtShift(s.shift_start), fmtShift(s.shift_end)].filter(Boolean).join(" – ")}
                      </span>
                    </div>
                  ))}
              </div>
              {/* Shift log — bottom */}
              <ColHeader icon="📓" label="Shift Log" count="today" />
              <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                {shiftLog.length === 0
                  ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>No notes yet</div>
                  : shiftLog.map(e => (
                    <div key={e.id} style={{ background: "rgba(251,191,36,0.05)", borderRadius: 7, padding: "7px 9px", borderLeft: "2px solid rgba(251,191,36,0.3)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#fde68a" }}>{e.employee_name}</span>
                        <span style={{ fontSize: 9, color: "#374151" }}>{fmtTime(e.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {e.note.length > 150 ? e.note.slice(0, 147) + "…" : e.note}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* COL 3: Needs Update */}
            <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <ColHeader icon="⚠️" label="Needs Update" count={`${needsUpdate.length} stale`} />
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                {needsUpdate.length === 0
                  ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>✓ All tickets recently updated</div>
                  : needsUpdate.map(t => (
                    <div key={t.id}>
                      <TicketPill t={t} onClick={() => setSelectedTicket(t)} />
                      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2, paddingLeft: 4 }}>
                        No update for {t.days_since_update >= 1 ? `${Math.floor(t.days_since_update)}d` : "< 1d"}
                      </div>
                    </div>
                  ))}
              </div>
              <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: "#374151", textAlign: "center" }}>📱 Log in to swoems.com to update</div>
              </div>
            </div>

            {/* COL 4: Spotlight (random open tickets) */}
            <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <ColHeader icon="🎯" label="Ticket Spotlight" count="5 random open" />
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                {spotlight.length === 0
                  ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>No open tickets</div>
                  : spotlight.map(t => <TicketPill key={t.id} t={t} onClick={() => setSelectedTicket(t)} />)}
              </div>
              <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: "#374151", textAlign: "center" }}>Rotates every 60 seconds · Click to view details</div>
              </div>
            </div>

            {/* COL 5: Closed Today */}
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <ColHeader icon="✅" label="Completed Today" count={`${closedToday.length} done`} />
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                {closedToday.length === 0
                  ? <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", paddingTop: 16 }}>None closed yet today</div>
                  : closedToday.map(t => {
                    const tc = TAG_COLORS[t.tag] || TAG_COLORS.Misc;
                    return (
                      <div key={t.id} style={{ background: "rgba(52,211,153,0.05)", borderRadius: 7, padding: "7px 9px", borderLeft: "2px solid rgba(52,211,153,0.35)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#d1fae5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                              {t.location && <span>📍 {t.location}</span>}
                              {t.assigned_name && <span style={{ marginLeft: 5 }}>· {t.assigned_name}</span>}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            {t.tag && <div style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 99, background: tc.bg, color: tc.text }}>{t.tag}</div>}
                            <div style={{ fontSize: 9, color: "#374151", marginTop: 2 }}>{fmtTime(t.closed_at)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── BOTTOM STATUS BAR ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 18px", background: "rgba(0,0,0,0.5)", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.6)", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 9, color: "#4b5563" }}>Live · Auto-refreshes every 60s · Updates require mobile login at swoems.com</span>
        </div>
        <span style={{ fontSize: 9, color: "#374151" }}>SWOEMS © SeaWorld Entertainment</span>
      </div>

      {/* ── TICKET MODAL ──────────────────────────────────────────────── */}
      {selectedTicket && <TicketModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  );
}
