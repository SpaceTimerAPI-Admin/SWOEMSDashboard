import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ParkHours from "../components/ParkHours";
import { getProfile, getToken } from "../lib/auth";

const BRIEFING_KEY = "swoems_st_briefing_dismissed";

function isClosed(t: any) {
  return ["closed","done"].includes((t?.status||"").toLowerCase()) || !!t?.closed_at;
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function authFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return res.json();
}

function ShiftBriefing({ onDismiss, openCount, starting, error }: {
  onDismiss: () => void; openCount: number | null; starting: boolean; error: string;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px", overflowY: "auto",
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "var(--surface, #1a1a2e)",
        borderRadius: 16,
        border: "1px solid rgba(46,232,160,0.25)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, rgba(46,232,160,0.15) 0%, rgba(52,211,153,0.08) 100%)",
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(46,232,160,0.15)",
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🎄</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            Christmas Shift Briefing
          </div>
          <div style={{ fontSize: 12, color: "rgba(46,232,160,0.8)" }}>
            Read before starting your shift
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🚶</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Walk the park</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                Walking the entire park is required during Christmas shifts. Log any issues with Christmas décor under the <strong style={{ color: "#7EEFC4" }}>Christmas dashboard</strong>.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⭐</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Priority at shift start</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                Review open Christmas tickets from previous days. Close out and restore anything that has been resolved before logging new issues.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Today's Tasks — required</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                When you start your shift you are assigned about a quarter of the open Christmas tickets.
                <strong style={{ color: "#FFB627" }}> Every assigned ticket must be reviewed during today's shift</strong>, and
                an update must be added to each one stating its <strong style={{ color: "#FFB627" }}>current status</strong> and
                <strong style={{ color: "#FFB627" }}> what troubleshooting took place</strong>.
              </div>
            </div>
          </div>

          {/* Open ticket count + link */}
          <Link to="/christmas?filter=open" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 10, textDecoration: "none",
            background: openCount && openCount > 0 ? "rgba(248,113,113,0.12)" : "rgba(52,211,153,0.1)",
            border: `1px solid ${openCount && openCount > 0 ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.25)"}`,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: openCount && openCount > 0 ? "#f87171" : "#7EEFC4" }}>
                {openCount === null ? "Loading…" : openCount === 0 ? "✓ No open tickets" : `${openCount} open ticket${openCount === 1 ? "" : "s"} need attention`}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Tap to view open Christmas tickets →</div>
            </div>
            <span style={{ fontSize: 20 }}>🎄</span>
          </Link>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{error}</div>}
          <button
            onClick={onDismiss}
            disabled={starting}
            style={{
              width: "100%", padding: "10px", borderRadius: 10, border: "none",
              background: "rgba(46,232,160,0.2)", color: "#7EEFC4",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            {starting ? "Starting shift…" : "Got it — start shift & assign my tickets"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShowTechHome() {
  const profile = getProfile();
  const navigate = useNavigate();
  const [showBriefing, setShowBriefing] = useState(false);
  const [openXmasCount, setOpenXmasCount] = useState<number | null>(null);
  const [tasks, setTasks] = useState<{ total: number; updated: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  function applyTasks(res: any) {
    const list: any[] = res?.tasks || [];
    setTasks({ total: list.length, updated: list.filter(t => t.updated).length });
  }

  useEffect(() => {
    // Show briefing once per day
    try {
      const last = localStorage.getItem(BRIEFING_KEY);
      if (last !== todayKey()) setShowBriefing(true);
    } catch { setShowBriefing(true); }

    async function load() {
      try {
        const xr = await fetch("/api/xmas-list-tickets").then(r => r.json());
        const xmasTickets: any[] = xr?.tickets || [];
        const openCount = xmasTickets.filter((t: any) => t.status === "open").length;
        setOpenXmasCount(openCount);
      } catch {}
    }
    void load();

    // The server knows who is on shift today. If this tech isn't yet, show the briefing
    // even if it was dismissed on this phone — acknowledging it is what starts the shift.
    async function loadShift() {
      try {
        const res = await authFetch("/api/showtech-tasks");
        if (!res?.ok) return;
        if (res.on_shift) applyTasks(res); else setShowBriefing(true);
      } catch {}
    }
    void loadShift();
  }, []);

  // Acknowledging the briefing puts the tech "on shift" and assigns their tickets.
  async function dismissBriefing() {
    if (starting) return;
    setStarting(true);
    setStartError("");
    try {
      const res = await authFetch("/api/showtech-shift-start", { method: "POST", body: "{}" });
      if (!res?.ok) { setStartError(res?.error || "Could not start your shift. Please try again."); return; }
      applyTasks(res);
      try { localStorage.setItem(BRIEFING_KEY, todayKey()); } catch {}
      setShowBriefing(false);
      // Straight to their assigned tickets.
      navigate("/todays-tasks");
    } catch {
      setStartError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="page fade-up">
      {showBriefing && <ShiftBriefing onDismiss={dismissBriefing} openCount={openXmasCount} starting={starting} error={startError} />}

      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Show Tech Portal</div>
      <ParkHours style={{ marginBottom: 12 }} />

      {/* Quick actions */}
      <div className="home-grid">
        <Link to="/todays-tasks" className="home-tile" style={{ background: "rgba(255,182,39,0.1)" }}>
          <div className="tile-icon" style={{ background: "rgba(255,182,39,0.2)" }}>📋</div>
          <div className="tile-title">Today's Tasks</div>
          <div className="tile-desc">
            {tasks === null ? "Your assigned tickets for this shift"
              : tasks.total === 0 ? "No tickets assigned"
              : `${tasks.updated} of ${tasks.total} tickets updated`}
          </div>
        </Link>
        <Link to="/shift-log" className="home-tile" style={{ background: "rgba(168,144,255,0.1)" }}>
          <div className="tile-icon" style={{ background: "rgba(168,144,255,0.2)" }}>📓</div>
          <div className="tile-title">Shift Log</div>
          <div className="tile-desc">Log notes from your shift</div>
        </Link>
        <Link to="/christmas" className="home-tile" style={{ background: "rgba(46,232,160,0.08)" }}>
          <div className="tile-icon" style={{ background: "rgba(46,232,160,0.15)" }}>🎄</div>
          <div className="tile-title">Christmas</div>
          <div className="tile-desc">Holiday lights & decor tickets</div>
        </Link>
        <Link to="/daily-signoffs" className="home-tile" style={{ background: "rgba(92,107,255,0.1)" }}>
          <div className="tile-icon" style={{ background: "rgba(92,107,255,0.2)" }}>✅</div>
          <div className="tile-title">Daily Sign Offs</div>
          <div className="tile-desc">Lake fountains & Snow Moments</div>
        </Link>
      </div>
    </div>
  );
}
