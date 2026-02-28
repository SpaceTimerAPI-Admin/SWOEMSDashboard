import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createTicket } from "../lib/api";

const TAGS = ["Lighting", "Sound", "Video", "Rides", "Misc"] as const;

export default function TicketNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [tag, setTag] = useState<(typeof TAGS)[number] | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: any = {
      title: title.trim(),
      location: location.trim(),
      details: details.trim(),
      tag: tag || undefined,
    };

    if (!payload.title) return setError("Title required");
    if (!payload.location) return setError("Location required");
    if (!payload.details) return setError("Details required");
    if (!payload.tag) return setError("Please select a tag");

    setLoading(true);
    try {
      const res: any = await createTicket(payload);
      if (!res?.ok) throw new Error(res?.error || "Failed to create ticket");
      const data = res.data ?? res;
      const ticket = data?.ticket || data?.data?.ticket || data?.ticket;
      if (ticket?.id) nav(`/tickets/${ticket.id}`);
      else nav("/tickets");
    } catch (e: any) {
      setError(e?.message || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page fade-up">
      <Link to="/tickets" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tickets
      </Link>

      <div className="page-title">New Ticket</div>
      <div className="page-subtitle">SLA: resolve within 1 hour.</div>

      <form onSubmit={onSubmit} className="card" style={{ padding: "16px" }}>
        <label>
          <div className="field-label">Title</div>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief description of the issue"
          />
        </label>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Location</div>
          <input
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where is the issue?"
          />
        </label>

        <div style={{ marginTop: 2 }}>
          <div className="field-label">Category</div>
          <div className="tag-row">
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-btn${tag === t ? " active" : ""}`}
                onClick={() => setTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Details</div>
          <textarea
            className="textarea"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            placeholder="Describe the issue in detail…"
          />
        </label>

        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

        <button className="btn primary full" style={{ marginTop: 14 }} disabled={loading}>
          {loading ? <><span className="spinner" /> Creating…</> : "Create ticket"}
        </button>

        <div className="muted" style={{ marginTop: 8, textAlign: "center" }}>
          You can add photos after creating the ticket.
        </div>
      </form>
    </div>
  );
}
