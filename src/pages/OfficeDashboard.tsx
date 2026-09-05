import React, { useEffect, useRef, useState } from "react";

const REFRESH_MS = 60_000; // 1 minute
const TZ = "America/New_York";

const TAG_COLORS: Record<string, string> = {
  Lighting: "#818cf8", Sound: "#34d399", Video: "#f59e0b",
  Rides: "#f87171", Misc: "#9ca3af",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function nowDisplay() {
  return new Date().toLocaleString("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

async function fetchDashboard() {
  const res = await fetch("/api/office-dashboard");
  return res.json();
}

export default function OfficeDashboard() {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [clock, setClock]       = useState(nowDisplay());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void load();

    timerRef.current = setInterval(() => { void load(); }, REFRESH_MS);
    clockRef.current = setInterval(() => setClock(nowDisplay()), 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, []);

  async function load() {
    try {
      const res = await fetchDashboard();
      if (res.ok) {
        setData(res);
        setLastUpdated(new Date().toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }));
        setError(null);
      } else {
        setError(res.error || "Failed to load");
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  const stats = data?.stats || {};
  const groupme: any[] = data?.groupme || [];
  const closedToday: any[] = data?.closed_today || [];
  const shiftLog: any[] = data?.shift_log || [];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#060912",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", background: "rgba(0,0,0,0.4)",
        borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>🔧</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>SWOEMS Operations Center</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>SeaWorld Entertainment Maintenance</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e5e7eb", letterSpacing: "-0.01em" }}>{clock}</div>
          {lastUpdated && (
            <div style={{ fontSize: 10, color: "#4b5563" }}>Updated {lastUpdated}</div>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 14, color: "#6b7280" }}>Loading dashboard…</div>
        </div>
      ) : error && !data ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 14, color: "#f87171" }}>⚠ {error}</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gridTemplateRows: "auto 1fr", gap: 0, minHeight: 0, overflow: "hidden" }}>

          {/* ── STAT CARDS (top, full width) ──────────────────────────────── */}
          <div style={{
            gridColumn: "1 / -1", display: "flex", gap: 12, padding: "14px 20px",
            background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            {[
              { label: "Open Work Orders", value: stats.open_total ?? "—", color: "#818cf8", sub: `${stats.open_tickets ?? 0} tickets · ${stats.open_projects ?? 0} projects` },
              { label: "Overdue", value: stats.overdue ?? "—", color: stats.overdue > 0 ? "#f87171" : "#34d399", sub: stats.overdue > 0 ? "Needs immediate attention" : "All on track" },
              { label: "Closed Today", value: stats.closed_today ?? "—", color: "#34d399", sub: "Work orders resolved" },
              { label: "Shift Log Entries", value: shiftLog.length, color: "#fbbf24", sub: "Notes logged today" },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 2,
              }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: s.color, lineHeight: 1.1, letterSpacing: "-0.03em" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#4b5563" }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* ── GROUPME FEED (left column) ────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>💬</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e7eb" }}>GroupMe Chat</span>
              <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{groupme.length} messages</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {groupme.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", paddingTop: 20 }}>No recent messages</div>
              ) : (
                groupme.map(m => (
                  <div key={m.id} style={{
                    background: "rgba(255,255,255,0.04)", borderRadius: 8,
                    padding: "8px 10px", borderLeft: "2px solid rgba(129,140,248,0.4)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#c7d2fe" }}>{m.sender}</span>
                      <span style={{ fontSize: 10, color: "#374151" }}>{fmtTime(m.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.45, wordBreak: "break-word" }}>
                      {m.text.length > 180 ? m.text.slice(0, 177) + "…" : m.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── CLOSED TODAY (middle column) ─────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e7eb" }}>Completed Today</span>
              <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{closedToday.length} work orders</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {closedToday.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", paddingTop: 20 }}>None closed yet today</div>
              ) : (
                closedToday.map((t, i) => (
                  <div key={`${t.type}-${t.id}`} style={{
                    background: "rgba(52,211,153,0.06)", borderRadius: 8,
                    padding: "8px 10px", borderLeft: "2px solid rgba(52,211,153,0.4)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#d1fae5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.title}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                          {t.location && <span>📍 {t.location}</span>}
                          {t.assigned_name && <span style={{ marginLeft: 6 }}>· {t.assigned_name}</span>}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        {t.tag && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: `${TAG_COLORS[t.tag] || "#9ca3af"}22`, color: TAG_COLORS[t.tag] || "#9ca3af" }}>
                            {t.tag}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "#374151" }}>{fmtTime(t.closed_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── SHIFT LOG (right column) ─────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>📓</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e7eb" }}>Shift Log</span>
              <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>Today's notes</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {shiftLog.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", paddingTop: 20 }}>No shift notes yet today</div>
              ) : (
                shiftLog.map(e => (
                  <div key={e.id} style={{
                    background: "rgba(251,191,36,0.06)", borderRadius: 8,
                    padding: "8px 10px", borderLeft: "2px solid rgba(251,191,36,0.35)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#fde68a" }}>{e.employee_name}</span>
                      <span style={{ fontSize: 10, color: "#374151" }}>{fmtTime(e.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {e.note.length > 220 ? e.note.slice(0, 217) + "…" : e.note}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* ── BOTTOM STATUS BAR ────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 20px", background: "rgba(0,0,0,0.5)",
        borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.6)", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 10, color: "#4b5563" }}>Live · Refreshes every 60 seconds</span>
        </div>
        <span style={{ fontSize: 10, color: "#374151" }}>SWOEMS © SeaWorld Entertainment</span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
