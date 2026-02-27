import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";

function badge(t: any) {
  if (t.is_overdue) return { text: "OVERDUE", style: { color: "#ff8b8b" } };
  const mins = Math.ceil((t.ms_left || 0) / 60000);
  if (mins <= 15) return { text: "DUE SOON", style: { color: "#ffd27a" } };
  return { text: "ON TRACK", style: { color: "#b7c2ff" } };
}

export default function Tickets() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    setBusy(true);
    try {
      const res = await listTickets(false);
      setItems(res.tickets || []);
    } catch (e: any) {
      setErr(e.message || "Failed to load tickets");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="container">
      <div className="row" style={{alignItems:"center"}}>
        <div className="col"><div className="h1">Tickets</div></div>
        <div className="col" style={{textAlign:"right"}}>
          <Link to="/tickets/new" className="btn" style={{display:"inline-block", width:"auto", padding:"12px 14px"}}>+ Log A Call</Link>
        </div>
      </div>

      {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}

      <div style={{marginTop:12, display:"grid", gap:12}}>
        {busy ? <div className="card"><div className="muted">Loading...</div></div> : null}

        {!busy && items.length === 0 ? (
          <div className="card">
            <div className="muted">No open tickets.</div>
          </div>
        ) : null}

        {items.map((t) => {
          const b = badge(t);
          return (
            <Link key={t.id} to={`/tickets/${t.id}`} style={{textDecoration:"none"}}>
              <div className="card">
                <div style={{display:"flex", justifyContent:"space-between", gap:10}}>
                  <div style={{fontWeight:800}}>{t.title}</div>
                  <div style={{fontSize:12, fontWeight:800, ...b.style}}>{b.text}</div>
                </div>
                <div className="muted" style={{marginTop:4}}>{t.location}</div>
                <div className="muted" style={{marginTop:6}}>
                  Logged by {t.created_by_name} • {new Date(t.created_at).toLocaleString()}
                </div>
                <div className="muted" style={{marginTop:6}}>
                  SLA Due: {new Date(t.sla_due_at).toLocaleString()}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div style={{marginTop:12}}>
        <button className="btn secondary" onClick={load} disabled={busy}>Refresh</button>
      </div>

      <div className="spacer" />
    </div>
  );
}
