import React, { useState } from "react";
import { sendEod } from "../lib/api";

export default function EOD() {
  const [notes, setNotes] = useState("");
  const [handoff_notes, setHandoff] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function onSend() {
    setStatus(null);
    setIsSuccess(false);
    setBusy(true);
    try {
      await sendEod({ notes, handoff_notes });
      setStatus("EOD report emailed and saved.");
      setIsSuccess(true);
    } catch (e: any) {
      setStatus(e.message || "Failed to send EOD");
      setIsSuccess(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page fade-up">
      <div className="page-title">End of Day</div>
      <div className="page-subtitle">Generates a full-detail recap for today and emails it to you.</div>

      <div className="card" style={{ padding: "16px" }}>
        <label>
          <div className="field-label">Notes</div>
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened today?"
          />
        </label>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Handoff Notes</div>
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            value={handoff_notes}
            onChange={(e) => setHandoff(e.target.value)}
            placeholder="What does the next shift need to know?"
          />
        </label>

        {status && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 13px",
              borderRadius: 10,
              fontSize: 13,
              background: isSuccess ? "var(--success-bg)" : "var(--danger-bg)",
              color: isSuccess ? "#7EEFC4" : "#FFB0B0",
              border: `1px solid ${isSuccess ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}`,
            }}
          >
            {isSuccess ? "✓ " : "⚠ "}{status}
          </div>
        )}

        <button
          className="btn primary full"
          style={{ marginTop: 14 }}
          onClick={onSend}
          disabled={busy}
        >
          {busy ? <><span className="spinner" /> Sending…</> : "Send EOD report"}
        </button>
      </div>
    </div>
  );
}
