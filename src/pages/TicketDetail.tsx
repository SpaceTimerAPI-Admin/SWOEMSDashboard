import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { addTicketComment, closeTicket, convertTicket, getTicket } from "../lib/api";

function fmt(ms: number) {
  const abs = Math.abs(ms);
  const s = Math.floor(abs / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = s % 60;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m ${ss}s`;
}

export default function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  async function load() {
    setErr(null);
    try {
      const res = await getTicket(String(id));
      setData(res);
    } catch (e: any) {
      setErr(e.message || "Failed to load ticket");
    }
  }

  useEffect(() => { load(); }, [id]);

  const dueInfo = useMemo(() => {
    if (!data?.ticket?.sla_due_at) return null;
    const due = new Date(data.ticket.sla_due_at).getTime();
    const ms = due - Date.now();
    return { ms, overdue: ms < 0 };
  }, [data]);

  async function onAddComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await addTicketComment({ ticket_id: String(id), comment: comment.trim() });
      setComment("");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to add comment");
    } finally {
      setBusy(false);
    }
  }

  async function onClose() {
    setBusy(true);
    try {
      await closeTicket({ id: String(id) });
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to close");
    } finally {
      setBusy(false);
    }
  }

  async function onConvert() {
    setBusy(true);
    try {
      const res = await convertTicket({ ticket_id: String(id) });
      nav(`/projects`);
      alert(`Converted to project: ${res.project_id}`);
    } catch (e: any) {
      setErr(e.message || "Failed to convert");
    } finally {
      setBusy(false);
    }
  }

  const t = data?.ticket;
  const comments = data?.comments || [];

  return (
    <div className="container">
      <div className="row" style={{alignItems:"center"}}>
        <div className="col">
          <div className="h1">Ticket</div>
          <div className="muted"><Link to="/tickets">Back to tickets</Link></div>
        </div>
      </div>

      {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}

      {t ? (
        <>
          <div className="card" style={{marginTop:12}}>
            <div className="h2">{t.title}</div>
            <div className="muted">Location: {t.location}</div>
            <div className="muted">Logged by {t.created_by_name} • {new Date(t.created_at).toLocaleString()}</div>
            <div style={{marginTop:8}}>
              <span className="muted">Status: </span><b>{t.status}</b>
            </div>
            <div style={{marginTop:6}}>
              <span className="muted">SLA Due: </span>{new Date(t.sla_due_at).toLocaleString()}
              {dueInfo ? (
                <span style={{marginLeft:10, fontWeight:700, color: dueInfo.overdue ? "#ff8b8b" : "#b7c2ff"}}>
                  {dueInfo.overdue ? `Overdue by ${fmt(dueInfo.ms)}` : `Due in ${fmt(dueInfo.ms)}`}
                </span>
              ) : null}
            </div>
            <div style={{marginTop:10}}>{t.details}</div>

            <div className="row" style={{marginTop:12}}>
              <div className="col">
                <button className="btn secondary" onClick={onConvert} disabled={busy}>Convert to Project</button>
              </div>
              <div className="col">
                <button className="btn danger" onClick={onClose} disabled={busy || t.status === "closed"}>
                  {t.status === "closed" ? "Closed" : "Close Ticket"}
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="h2">Updates</div>
            {comments.length ? (
              <div style={{display:"grid", gap:10}}>
                {comments.map((c: any) => (
                  <div key={c.id} style={{padding:10, borderRadius:12, border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div className="muted">{c.employee_name} • {new Date(c.created_at).toLocaleString()}</div>
                    <div style={{marginTop:6}}>{c.comment}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No updates yet.</div>
            )}

            <label style={{marginTop:12}}>Add update</label>
            <textarea className="input" style={{minHeight:90}} value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="What changed?" />
            <div style={{marginTop:10}}>
              <button className="btn" onClick={onAddComment} disabled={busy || !comment.trim()}>
                {busy ? "Saving..." : "Add update"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{marginTop:12}}><div className="muted">Loading...</div></div>
      )}

      <div className="spacer" />
    </div>
  );
}
