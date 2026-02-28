import React, { useState } from "react";
import { sendEod } from "../lib/api";

export default function EOD() {
  const [notes, setNotes] = useState("");
  const [handoff_notes, setHandoff] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSend() {
    setStatus(null);
    setBusy(true);
    try {
      await sendEod({ notes, handoff_notes });
      setStatus("EOD report emailed to you and saved.");
    } catch (e: any) {
      setStatus(e.message || "Failed to send EOD");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="h1">End of Day Report</div>
      <div className="card">
        <div className="muted">
          Generates a full-detail team recap for today and emails it to you (no
          photos).
        </div>
        <label>Notes</label>
        <textarea
          className="input"
          style={{ minHeight: 110 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <label>Handoff Notes</label>
        <textarea
          className="input"
          style={{ minHeight: 110 }}
          value={handoff_notes}
          onChange={(e) => setHandoff(e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={onSend} disabled={busy}>
            {busy ? "Sending..." : "Send EOD to myself"}
          </button>
        </div>
        {status ? <div style={{ marginTop: 10 }}>{status}</div> : null}
      </div>
      <div className="spacer" />
    </div>
  );
}
