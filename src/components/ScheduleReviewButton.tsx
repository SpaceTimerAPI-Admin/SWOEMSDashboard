import React, { useState } from "react";
import { createReview } from "../lib/api";
import { getRole } from "../lib/auth";

interface Props {
  itemType: "ticket" | "project";
  itemId: string;
  itemTitle: string;
}

export default function ScheduleReviewButton({ itemType, itemId, itemTitle }: Props) {
  const role = getRole();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-CA");
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (role === "show_tech") return null;

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      await createReview({ item_type: itemType, item_id: itemId, item_title: itemTitle, review_date: date, note: note || undefined });
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setNote(""); }, 1400);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  return (
    <>
      <button
        onClick={() => { setDone(false); setOpen(true); }}
        className="btn small"
        style={{ borderColor: "rgba(129,140,248,0.3)", background: "rgba(129,140,248,0.08)", color: "#c7d2fe" }}
      >
        📅 Schedule Review
      </button>

      {open && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="card modal-card">
            <div className="modal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="modal-title">Schedule Review</h3>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body">
              {done ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                  <div style={{ fontSize: 14, color: "#34d399", fontWeight: 600 }}>Review scheduled!</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    Visible on the Schedule page this week
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                    {itemType === "ticket" ? "🎫" : "📐"}{" "}
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{itemTitle}</span>
                  </div>
                  <label>
                    <div className="field-label">Review Date</div>
                    <input
                      type="date" className="input" value={date}
                      min={new Date().toLocaleDateString("en-CA")}
                      onChange={e => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    <div className="field-label">Note (optional)</div>
                    <textarea
                      className="textarea" value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="What needs to be checked? e.g. Follow up on part delivery, verify fix held..."
                      style={{ minHeight: 80 }}
                    />
                  </label>
                  <button
                    className="btn primary" onClick={handleSave}
                    disabled={saving || !date}
                    style={{ width: "100%", marginTop: 16 }}
                  >
                    {saving ? <span className="spinner" /> : "Schedule Review"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
