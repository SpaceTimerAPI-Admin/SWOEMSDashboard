import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createTicket } from "../lib/api";

export default function TicketNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [tag, setTag] = useState<"Lighting"|"Sound"|"Video"|"Rides"|"Misc">("Misc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      title: title.trim(),
      location: location.trim(),
      details: details.trim(),
      tag,
    };

    if (!payload.title) return setError("Title required");
    if (!payload.location) return setError("Location required");
    if (!payload.details) return setError("Details required");
    if (!payload.tag) return setError("Category required");

    setLoading(true);
    try {
      const res: any = await createTicket(payload);
      if (!res?.ok) throw new Error(res?.error || "Failed to create ticket");
      const ticket = res?.ticket || res?.data?.ticket;
      if (ticket?.id) nav(`/tickets/${ticket.id}`);
      else nav("/tickets");
    } catch (err: any) {
      setError(err?.message || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      
      <div className="field" style={{ marginTop: 10 }}>
        <div className="label">Category</div>
        <div className="chips" style={{ marginTop: 8 }}>
          {(["Lighting","Sound","Video","Rides","Misc"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${tag === t ? "active" : ""}`}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="hint">Required. Used for reporting and end-of-day grouping.</div>
      </div>

<div className="row between wrap" style={{ gap: 10 }}>
        <Link className="btn inline ghost" to="/tickets">← Back</Link>
        <span className="badge neutral">SLA 1 hour</span>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h1 style={{ marginBottom: 8 }}>Create Ticket</h1>
        <div className="muted">After creating, you can add photos and updates inside the ticket.</div>

        <form onSubmit={onSubmit} className="form" style={{ marginTop: 12 }}>
          <label>
            Ticket title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </label>

          <label>
            Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where is this happening?" />
          </label>

          <label>
            Details
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={7} placeholder="What’s happening? Any troubleshooting already done?" />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn" disabled={loading}>
            {loading ? "Creating..." : "Create ticket"}
          </button>
        </form>
      </div>

      <div className="spacer" />
    </div>
  );
}
