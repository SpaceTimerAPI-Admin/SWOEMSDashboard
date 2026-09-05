import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  return res.json();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function XmasTickets() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "fixed">("all");
  const [search, setSearch] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/xmas-list-tickets");
      setTickets(res.tickets || []);
    } finally { setLoading(false); }
  }

  const filtered = tickets.filter(t => {
    if (filter !== "all" && t.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (t.location_friendly || "").toLowerCase().includes(q) ||
             (t.tech_name || "").toLowerCase().includes(q) ||
             (t.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  const openCount = tickets.filter(t => t.status === "open").length;

  return (
    <div className="page fade-up">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div className="page-title">🎄 Christmas Tickets</div>
          <div className="page-subtitle">
            {openCount > 0
              ? <span style={{ color: "#f87171", fontWeight: 600 }}>{openCount} open issue{openCount !== 1 ? "s" : ""}</span>
              : "All clear ✓"}
          </div>
        </div>
        <Link to="/christmas/new" className="btn primary small">+ New Ticket</Link>
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          className="input" placeholder="Search tickets…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "open", "fixed"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`btn small${filter === f ? " primary" : ""}`}>
              {f === "all" ? "All" : f === "open" ? "Open" : "Fixed"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32 }}><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎄</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>
            {search ? `No tickets matching "${search}"` : filter === "open" ? "No open tickets" : filter === "fixed" ? "No fixed tickets" : "No tickets yet"}
          </div>
        </div>
      ) : (
        <div className="cards">
          {filtered.map(t => (
            <Link key={t.id} to={`/christmas/${t.id}`} className="item-card" style={{ textDecoration: "none" }}>
              <div className="item-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="item-title">#{t.id} — {t.location_friendly}</div>
                  <div className="item-sub" style={{ marginTop: 3 }}>
                    👤 {t.tech_name}
                    <span className="dot">·</span>
                    {fmtDate(t.created_at)}
                  </div>
                  {t.description && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.description}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, flexShrink: 0,
                  background: t.status === "fixed" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
                  color: t.status === "fixed" ? "#34d399" : "#f87171",
                  border: `1px solid ${t.status === "fixed" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                }}>
                  {t.status === "fixed" ? "✓ Fixed" : "Open"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
