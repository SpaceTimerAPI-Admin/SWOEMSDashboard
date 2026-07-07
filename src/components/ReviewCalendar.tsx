import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getReviewSchedule, updateReview, deleteReview } from "../lib/api";
import { getRole } from "../lib/auth";

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface Review {
  id: string;
  item_type: "ticket" | "project";
  item_id: string;
  item_title: string;
  review_date: string;
  note: string | null;
  completed: boolean;
  creator: { name: string } | null;
}

interface Props {
  weekStart: string; // YYYY-MM-DD (Sunday)
}

export default function ReviewCalendar({ weekStart }: Props) {
  const role = getRole();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Review | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayET();

  useEffect(() => { void load(); }, [weekStart]);

  async function load() {
    setLoading(true);
    try {
      const res: any = await getReviewSchedule(weekStart);
      const data = res?.ok ? res.data?.reviews ?? res.reviews : [];
      setReviews(data || []);
    } catch { setReviews([]); }
    finally { setLoading(false); }
  }

  async function toggleComplete(r: Review) {
    const res: any = await updateReview(r.id, { completed: !r.completed });
    const updated = res?.ok ? (res.data?.review ?? res.review) : null;
    if (updated) setReviews(prev => prev.map(x => x.id === r.id ? { ...x, ...updated } : x));
  }

  async function handleEditSave() {
    if (!editTarget || !editDate) return;
    setSaving(true);
    try {
      const res: any = await updateReview(editTarget.id, { review_date: editDate, note: editNote || null });
      const updated = res?.ok ? (res.data?.review ?? res.review) : null;
      if (updated) setReviews(prev => prev.map(x => x.id === editTarget.id ? { ...x, ...updated } : x));
      setEditTarget(null);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await deleteReview(editTarget.id);
      setReviews(prev => prev.filter(x => x.id !== editTarget.id));
      setEditTarget(null);
    } finally { setSaving(false); }
  }

  const pending = reviews.filter(r => !r.completed).length;

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>
            📋 Review Schedule
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Tickets & projects flagged for review this week
            {pending > 0 && (
              <span style={{
                marginLeft: 8, background: "rgba(255,182,39,0.15)", color: "#FFD07A",
                padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
              }}>{pending} pending</span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
        </div>
      ) : reviews.length === 0 ? (
        <div className="card" style={{ padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>📅</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No reviews scheduled this week</div>
          <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}>
            Open a ticket or project and tap "Schedule Review"
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {days.map(dateStr => {
            const dayReviews = reviews.filter(r => r.review_date === dateStr);
            if (dayReviews.length === 0) return null;
            const isToday = dateStr === today;
            return (
              <div key={dateStr}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: isToday ? "#818cf8" : "var(--muted2)",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  padding: "10px 2px 5px", display: "flex", alignItems: "center", gap: 6,
                }}>
                  {fmtDayLabel(dateStr)}
                  {isToday && (
                    <span style={{ background: "#818cf8", color: "#fff", fontSize: 9, padding: "1px 6px", borderRadius: 99 }}>
                      TODAY
                    </span>
                  )}
                </div>
                {dayReviews.map(r => (
                  <div key={r.id} className="card" style={{
                    padding: "10px 14px", marginBottom: 5,
                    opacity: r.completed ? 0.55 : 1,
                    borderLeft: `3px solid ${r.item_type === "ticket" ? "#818cf8" : "#34d399"}`,
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                            color: r.item_type === "ticket" ? "#818cf8" : "#34d399",
                          }}>
                            {r.item_type === "ticket" ? "🎫 Ticket" : "📐 Project"}
                          </span>
                          {r.completed && (
                            <span style={{ fontSize: 10, color: "#34d399", fontWeight: 600 }}>✓ Done</span>
                          )}
                        </div>
                        <Link
                          to={`/${r.item_type}s/${r.item_id}`}
                          style={{
                            fontSize: 13, fontWeight: 600, color: "var(--text)",
                            textDecoration: "none", display: "block",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {r.item_title}
                        </Link>
                        {r.note && (
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>
                            {r.note}
                          </div>
                        )}
                        {r.creator?.name && (
                          <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 3 }}>
                            Added by {r.creator.name}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button
                          onClick={() => toggleComplete(r)}
                          title={r.completed ? "Mark incomplete" : "Mark complete"}
                          style={{
                            width: 28, height: 28, borderRadius: 8, border: "1px solid",
                            borderColor: r.completed ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.1)",
                            background: r.completed ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)",
                            color: r.completed ? "#34d399" : "var(--muted)",
                            cursor: "pointer", fontSize: 13,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >{r.completed ? "✓" : "○"}</button>
                        {role !== "show_tech" && (
                          <button
                            onClick={() => { setEditTarget(r); setEditDate(r.review_date); setEditNote(r.note || ""); }}
                            title="Edit"
                            style={{
                              width: 28, height: 28, borderRadius: 8,
                              border: "1px solid rgba(255,255,255,0.1)",
                              background: "rgba(255,255,255,0.04)", color: "var(--muted)",
                              cursor: "pointer", fontSize: 13,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >✏️</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditTarget(null); }}>
          <div className="card modal-card">
            <div className="modal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="modal-title">Edit Review</h3>
              <button onClick={() => setEditTarget(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                {editTarget.item_type === "ticket" ? "🎫" : "📐"} {editTarget.item_title}
              </div>
              <label>
                <div className="field-label">Review Date</div>
                <input type="date" className="input" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </label>
              <label>
                <div className="field-label">Note (optional)</div>
                <textarea className="textarea" value={editNote} onChange={e => setEditNote(e.target.value)}
                  placeholder="What needs to be reviewed?" style={{ minHeight: 70 }} />
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
                <button onClick={handleDelete} disabled={saving} style={{
                  padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,84,84,0.3)",
                  background: "rgba(255,84,84,0.1)", color: "#FFB0B0", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Remove</button>
                <button className="btn primary" onClick={handleEditSave} disabled={saving || !editDate}>
                  {saving ? <span className="spinner" /> : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
