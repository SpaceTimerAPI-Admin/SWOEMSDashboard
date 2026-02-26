import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTicket } from "../lib/api";

export default function TicketNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await createTicket({ title, location, details, sla_minutes: 60 });
      nav(`/tickets/${res.ticket.id}`);
    } catch (e: any) {
      setErr(e.message || "Failed to create ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="h1">Log A Call</div>
      <div className="card">
        <form onSubmit={onSubmit}>
          <label>Ticket title</label>
          <input className="input" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Short summary" />
          <label>Location</label>
          <input className="input" value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="Area / attraction / zone" />
          <label>Details</label>
          <textarea className="input" style={{minHeight:140}} value={details} onChange={(e)=>setDetails(e.target.value)} placeholder="What came over the radio?" />
          {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}
          <div style={{marginTop:12}}>
            <button className="btn" disabled={busy}>{busy ? "Creating..." : "Create ticket (SLA 1 hour)"}</button>
          </div>
          <div style={{marginTop:10}} className="muted">Photos will be added next.</div>
        </form>
      </div>
      <div className="spacer" />
    </div>
  );
}
