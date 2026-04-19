import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets, listProjects, getTodaySchedule } from "../lib/api";
import { getProfile } from "../lib/auth";

type TileProps = {
  to: string;
  icon: string;
  title: string;
  desc: string;
  accent?: string;
};

function Tile({ to, icon, title, desc, accent = "rgba(92,107,255,0.15)" }: TileProps) {
  return (
    <Link to={to} className="home-tile">
      <div className="tile-icon" style={{ background: accent }}>{icon}</div>
      <div className="tile-title">{title}</div>
      <div className="tile-desc">{desc}</div>
    </Link>
  );
}

function parseDate(v: any): number {
  const ms = Date.parse(v || "");
  return Number.isFinite(ms) ? ms : 0;
}

function isClosed(t: any): boolean {
  const s = (t?.status || "").toLowerCase();
  return s === "closed" || s === "done" || !!t?.closed_at;
}

export default function Home() {
  const profile = getProfile();
  const [assigned, setAssigned] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    async function loadAssigned() {
      try {
        const [tr, pr] = await Promise.all([
          listTickets({ includeClosed: false }) as any,
          listProjects({ includeClosed: false }) as any,
        ]);
        const tickets = (tr?.ok ? tr?.data?.tickets || tr?.tickets || [] : [])
          .filter((t: any) => t.assigned_to === profile!.id && !isClosed(t));
        const projects = (pr?.ok ? pr?.data?.projects || pr?.projects || [] : [])
          .filter((p: any) => p.assigned_to === profile!.id && !isClosed(p));
        // merge and sort newest first
        const all = [
          ...tickets.map((t: any) => ({ ...t, _type: "ticket" })),
          ...projects.map((p: any) => ({ ...p, _type: "project" })),
        ].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
        setAssigned(all);
      } catch {}
    }
    void loadAssigned();
  }, [profile?.id]);

  return (
    <div className="page fade-up">
      <div style={{ marginBottom: 4 }}>
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">SeaWorld Entertainment Maintenance</div>
      </div>

      {/* My Assignments */}
      {assigned.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 8,
          }}>
            📌 Assigned to you ({assigned.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {assigned.map(item => (
              <Link
                key={item.id}
                to={item._type === "ticket" ? `/tickets/${item.id}` : `/projects/${item.id}`}
                className="card"
                style={{
                  padding: "11px 14px", display: "block", textDecoration: "none",
                  borderLeft: "3px solid rgba(92,107,255,0.5)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                      {item._type === "project" ? "📐 Project" : "🎫 Ticket"}
                      {item.location ? ` · 📍 ${item.location}` : ""}
                      {item.tag ? ` · ${item.tag}` : ""}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                    background: "rgba(46,232,160,0.1)", color: "#7EEFC4",
                    border: "1px solid rgba(46,232,160,0.2)", whiteSpace: "nowrap",
                  }}>Open</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="home-grid">
        <Tile to="/tickets/new"  icon="🎫" title="Log a Call"   desc="Create a new work order ticket"     accent="rgba(92,107,255,0.18)" />
        <Tile to="/tickets"      icon="📋" title="Tickets"      desc="View & manage all tickets"          accent="rgba(46,232,160,0.12)" />
        <Tile to="/projects"     icon="📐" title="Projects"     desc="Track longer-term work items"       accent="rgba(255,182,39,0.12)" />
        <Tile to="/shift-log"    icon="📓" title="Shift Log"    desc="Log notes throughout your shift"    accent="rgba(168,144,255,0.15)" />
        <Tile to="/eod"          icon="📝" title="EOD Report"   desc="Generate & email today's recap"     accent="rgba(255,84,84,0.12)" />
        <Tile to="/settings"     icon="⚙️" title="Settings"    desc="Account & preferences"              accent="rgba(255,255,255,0.06)" />
      </div>
    </div>
  );
}
