import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getProfile } from "../lib/auth";

const BRIEFING_KEY = "swoems_st_briefing_dismissed";

function isClosed(t: any) {
  return ["closed","done"].includes((t?.status||"").toLowerCase()) || !!t?.closed_at;
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function ShiftBriefing({ onDismiss, openCount }: { onDismiss: () => void; openCount: number | null }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 16px",
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

          {/* Open ticket count + link */}
          <Link to="/christmas?filter=open" onClick={onDismiss} style={{
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
          <button
            onClick={onDismiss}
            style={{
              width: "100%", padding: "10px", borderRadius: 10, border: "none",
              background: "rgba(46,232,160,0.2)", color: "#7EEFC4",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Got it — start shift
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShowTechHome() {
  const profile = getProfile();
  const [showBriefing, setShowBriefing] = useState(false);
  const [openXmasCount, setOpenXmasCount] = useState<number | null>(null);

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
  }, []);

  function dismissBriefing() {
    try { localStorage.setItem(BRIEFING_KEY, todayKey()); } catch {}
    setShowBriefing(false);
  }

  return (
    <div className="page fade-up">
      {showBriefing && <ShiftBriefing onDismiss={dismissBriefing} openCount={openXmasCount} />}

      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Show Tech Portal</div>

      {/* Quick actions */}
      <div className="home-grid">
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
      </div>
    </div>
  );
}
