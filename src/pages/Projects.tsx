import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../lib/api";

function badge(p: any) {
  if (p.is_overdue) return { text: "OVERDUE", style: { color: "#ff8b8b" } };
  const daysLeft = Math.ceil((p.ms_left || 0) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 2) return { text: "DUE SOON", style: { color: "#ffd27a" } };
  return { text: "ON TRACK", style: { color: "#b7c2ff" } };
}

export default function Projects() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    setBusy(true);
    try {
      const res = await listProjects(true);
      setItems(res.projects || []);
    } catch (e: any) {
      setErr(e.message || "Failed to load projects");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const { open, past } = useMemo(() => {
    const open = items.filter((p) => p.status !== "closed");
    const past = items.filter((p) => p.status === "closed");
    past.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { open, past };
  }, [items]);

  return (
    <div className="container">
      <div className="row" style={{alignItems:"center"}}>
        <div className="col">
          <div className="h1">Projects</div>
          <div className="muted">Long-term items + history</div>
        </div>
        <div className="col" style={{textAlign:"right"}}>
          <Link to="/projects/new" className="btn" style={{display:"inline-block", width:"auto", padding:"12px 14px"}}>+ Create Project</Link>
        </div>
      </div>

      {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}

      <div style={{marginTop:12, display:"grid", gap:12}}>
        <div className="card">
          <div className="h2">Open Projects</div>

          {busy ? <div className="muted" style={{marginTop:10}}>Loading...</div> : null}
          {!busy && open.length === 0 ? <div className="muted" style={{marginTop:10}}>No open projects.</div> : null}

          {open.map((p) => {
            const b = badge(p);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} style={{textDecoration:"none"}}>
                <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{display:"flex", justifyContent:"space-between", gap:10}}>
                    <div style={{fontWeight:800}}>{p.title}</div>
                    <div style={{fontSize:12, fontWeight:800, ...b.style}}>{b.text}</div>
                  </div>
                  <div className="muted" style={{marginTop:4}}>{p.location}</div>
                  <div className="muted" style={{marginTop:6}}>
                    Created by {p.created_by_name} • {new Date(p.created_at).toLocaleString()}
                  </div>
                  <div className="muted" style={{marginTop:6}}>
                    SLA Due: {new Date(p.sla_due_at).toLocaleString()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="card">
          <div className="h2">Closed / Past Projects</div>

          {busy ? <div className="muted" style={{marginTop:10}}>Loading...</div> : null}
          {!busy && past.length === 0 ? <div className="muted" style={{marginTop:10}}>No past projects yet.</div> : null}

          {past.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} style={{textDecoration:"none"}}>
              <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{display:"flex", justifyContent:"space-between", gap:10}}>
                  <div style={{fontWeight:800}}>{p.title}</div>
                  <div style={{fontSize:12, fontWeight:800, color:"#b7c2ff"}}>CLOSED</div>
                </div>
                <div className="muted" style={{marginTop:4}}>{p.location}</div>
                <div className="muted" style={{marginTop:6}}>
                  Created by {p.created_by_name} • {new Date(p.created_at).toLocaleString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{marginTop:12}}>
        <button className="btn secondary" onClick={load} disabled={busy}>Refresh</button>
      </div>

      <div className="spacer" />
    </div>
  );
}
