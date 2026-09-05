import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createTicket } from "../lib/api";

const TAGS = ["Lighting", "Sound", "Video", "Rides", "Misc"] as const;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
}

function humanDue(dateStr: string): string {
  if (!dateStr) return "";
  const days = daysUntil(dateStr);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${Math.round(days)} days`;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TicketNew() {
  const nav = useNavigate();
  const [title, setTitle]       = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails]   = useState("");
  const [tag, setTag]           = useState<(typeof TAGS)[number] | "">("");
  const [dueDate, setDueDate]   = useState(todayStr());
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = {
      title: title.trim(),
      location: location.trim(),
      details: details.trim(),
      tag: tag || undefined,
    };

    if (!trimmed.title)    return setError("Title required");
    if (!trimmed.location) return setError("Location required");
    if (!trimmed.details)  return setError("Details required");
    if (!trimmed.tag)      return setError("Please select a category");
    if (!dueDate)          return setError("Expected completion date required");

    // Always create as a ticket — SLA in minutes until end of selected date
    const dueAt = new Date(dueDate + "T23:59:59");
    const sla_minutes = Math.max(60, Math.round((dueAt.getTime() - Date.now()) / 60000));

    setLoading(true);
    try {
      const res: any = await createTicket({ ...trimmed, sla_minutes } as any);
      if (!res?.ok) throw new Error(res?.error || "Failed to create work order");
      const data = res.data ?? res;
      const ticket = data?.ticket;
      if (ticket?.id) nav(`/tickets/${ticket.id}`);
      else nav("/tickets");
    } catch (e: any) {
      setError(e?.message || "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page fade-up">
      <Link to="/" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Home
      </Link>

      <div className="page-title">New Work Order</div>
      <div className="page-subtitle">Report a maintenance issue.</div>

      <form onSubmit={onSubmit} className="card" style={{ padding: "16px" }}>
        <label>
          <div className="field-label">Title</div>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description of the issue" />
        </label>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Location</div>
          <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Where is the issue?" />
        </label>

        <div style={{ marginTop: 2 }}>
          <div className="field-label">Category</div>
          <div className="tag-row">
            {TAGS.map(t => (
              <button key={t} type="button" className={`tag-btn${tag === t ? " active" : ""}`} onClick={() => setTag(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Details</div>
          <textarea className="textarea" value={details} onChange={e => setDetails(e.target.value)} rows={4} placeholder="Describe the issue in detail…" />
        </label>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Expected Completion</div>
          <input className="input" type="date" value={dueDate} min={todayStr()} onChange={e => setDueDate(e.target.value)} />
        </label>

        {dueDate && (
          <div style={{
            marginTop: 10, padding: "9px 13px", borderRadius: 10, fontSize: 13,
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(46,232,160,0.08)", border: "1px solid rgba(46,232,160,0.2)", color: "#7EEFC4",
          }}>
            <span style={{ fontSize: 16 }}>🔧</span>
            <span>Due <strong>{humanDue(dueDate)}</strong></span>
          </div>
        )}

        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

        <button className="btn primary full" style={{ marginTop: 14 }} disabled={loading}>
          {loading ? <><span className="spinner" /> Creating…</> : "Create Work Order"}
        </button>

        <div className="muted" style={{ marginTop: 8, textAlign: "center" }}>
          You can add photos and update the due date after creating.
        </div>
      </form>
    </div>
  );
}
