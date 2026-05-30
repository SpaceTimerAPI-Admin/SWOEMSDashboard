import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets, listProjects } from "../lib/api";
import { getProfile } from "../lib/auth";

function isClosed(t: any) {
  return ["closed","done"].includes((t?.status||"").toLowerCase()) || !!t?.closed_at;
}

export default function ShowTechHome() {
  const profile = getProfile();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [tr, pr] = await Promise.all([
          listTickets({ includeClosed: false }) as any,
          listProjects({ includeClosed: false }) as any,
        ]);
        const tickets = (tr?.ok ? (tr?.data?.tickets || tr?.tickets || []) : [])
          .filter((t: any) => !isClosed(t))
          .map((t: any) => ({ ...t, _type: "ticket" }));
        const projects = (pr?.ok ? (pr?.data?.projects || pr?.projects || []) : [])
          .filter((p: any) => !isClosed(p))
          .map((p: any) => ({ ...p, _type: "project" }));
        setItems([...tickets, ...projects].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
      } catch {}
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <div className="page fade-up">
      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Show Tech Portal</div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 8 }}>
          Open Items ({loading ? "…" : items.length})
        </div>
        {loading ? (
          <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div className="card" style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No open items assigned to Show Tech.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.slice(0, 8).map((item: any) => (
              <Link
                key={item.id}
                to={item._type === "ticket" ? `/tickets/${item.id}` : `/projects/${item.id}`}
                className="card"
                style={{ padding: "12px 14px", display: "block", textDecoration: "none",
                  borderLeft: "3px solid rgba(92,107,255,0.5)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: "var(--muted2)" }}>
                    {item._type === "ticket" ? "🎫 Ticket" : "📐 Project"}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: "var(--muted2)" }}>📍 {item.location}{item.tag ? ` · ${item.tag}` : ""}</div>
              </Link>
            ))}
            {items.length > 8 && (
              <Link to="/tickets" style={{ fontSize: 13, color: "#B0B8FF", textAlign: "center", padding: "8px" }}>
                View all {items.length} items →
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="home-grid">
        <Link to="/tickets/new" className="home-tile" style={{ background: "rgba(92,107,255,0.12)" }}>
          <div className="tile-icon" style={{ background: "rgba(92,107,255,0.2)" }}>🎫</div>
          <div className="tile-title">Create Work Order</div>
          <div className="tile-desc">Submit a new work request</div>
        </Link>
        <Link to="/tickets" className="home-tile" style={{ background: "rgba(46,232,160,0.08)" }}>
          <div className="tile-icon" style={{ background: "rgba(46,232,160,0.15)" }}>📋</div>
          <div className="tile-title">Tickets</div>
          <div className="tile-desc">View all show tech tickets</div>
        </Link>
        <Link to="/shift-log" className="home-tile" style={{ background: "rgba(168,144,255,0.1)" }}>
          <div className="tile-icon" style={{ background: "rgba(168,144,255,0.2)" }}>📓</div>
          <div className="tile-title">Shift Log</div>
          <div className="tile-desc">Log notes from your shift</div>
        </Link>
      </div>
    </div>
  );
}
