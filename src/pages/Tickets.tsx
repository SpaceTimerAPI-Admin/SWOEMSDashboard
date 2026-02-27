import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";

function badge(t: any) {
  if (t.is_overdue) return { text: "OVERDUE", style: { color: "#ff8b8b" } };
  const mins = Math.ceil((t.ms_left || 0) / 60000);
  if (mins <= 15) return { text: "DUE SOON", style: { color: "#ffd27a" } };
  return { text: "ON TRACK", style: { color: "#b7c2ff" } };
}

function statusBadge(t: any) {
  if (t.status === "closed") return { text: "CLOSED", style: { color: "#b7c2ff" } };
  if (t.status === "converted") return { text: "MOVED TO PROJECT", style: { color: "#ffd27a" } };
  return null;
}

export default function Tickets() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    setBusy(true);
    try {
      // Fetch all, then split into Open vs Past.
      const res = await listTickets(true);
      setItems(res.tickets || []);
    } catch (e: any) {
      setErr(e.message || "Failed to load tickets");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const { open, past } = useMemo(() => {
    const open = items.filter((t) => t.status === "open");
    const past = items.filter((t) => t.status !== "open");
    // Past: show newest first
    past.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { open, past };
  }, [items]);

  return (
    <div className="container">
      <div className="row" style={{ alignItems: "center" }}>
        <div className="col">
          <div className="h1">Tickets</div>
          <div className="muted">Open items + closed history</div>
        </div>
        <div className="col" style={{ textAlign: "right" }}>
          <Link
            to="/tickets/new"
            className="btn"
            style={{ display: "inline-block", width: "auto", padding: "12px 14px" }}
          >
            + Log a Call
          </Link>
        </div>
      </div>

      {err ? <div style={{ marginTop: 10, color: "#ff8b8b" }}>{err}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        <div className="card">
          <div className="h2">Open Tickets</div>

          {busy ? <div className="muted" style={{ marginTop: 10 }}>Loading...</div> : null}
          {!busy && open.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No open tickets.</div> : null}

          {open.map((t) => {
            const b = badge(t);
            return (
              <Link key={t.id} to={`/tickets/${t.id}`} style={{ textDecoration: "none" }}>
                <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>{t.title}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, ...b.style }}>{b.text}</div>
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>{t.location}</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Logged by {t.created_by_name} • {new Date(t.created_at).toLocaleString()}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    SLA Due: {new Date(t.sla_due_at).toLocaleString()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="card">
          <div className="h2">Closed / Past Tickets</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Includes closed tickets and tickets moved into Projects.
          </div>

          {busy ? <div className="muted" style={{ marginTop: 10 }}>Loading...</div> : null}
          {!busy && past.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No past tickets yet.</div> : null}

          {past.map((t) => {
            const sb = statusBadge(t);
            return (
              <Link key={t.id} to={`/tickets/${t.id}`} style={{ textDecoration: "none" }}>
                <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>{t.title}</div>
                    {sb ? <div style={{ fontSize: 12, fontWeight: 800, ...sb.style }}>{sb.text}</div> : null}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>{t.location}</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Logged by {t.created_by_name} • {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="btn secondary" onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>

      <div className="spacer" />
    </div>
  );
}
