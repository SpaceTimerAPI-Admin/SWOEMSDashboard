import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetPin } from "../lib/api";

export default function ResetPin() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const eid = employeeId.trim();
    const c = code.trim();
    const p1 = newPin.trim();
    const p2 = confirmPin.trim();

    if (!eid || !c || !p1 || !p2) {
      setError("All fields are required.");
      return;
    }
    if (!/^\d{4}$/.test(p1)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (p1 !== p2) {
      setError("PINs do not match.");
      return;
    }

    setLoading(true);
    try {
      const res: any = await resetPin({ employee_id: eid, code: c, new_pin: p1 });
      if (!res?.ok) {
        setError(res?.error || "Could not reset PIN.");
        return;
      }
      setDone(true);
      setTimeout(() => nav("/login"), 900);
    } catch (err: any) {
      setError(err?.message || "Could not reset PIN.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 22 }}>
      <div className="card">
        <div className="h1">Reset PIN</div>
        <div className="muted">Enter your Employee ID and the enrollment code to set a new 4-digit PIN.</div>

        <form onSubmit={onSubmit}>
          <label>Employee ID</label>
          <input
            className="input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            inputMode="numeric"
            autoComplete="username"
          />

          <label>Enrollment Code</label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />

          <label>New PIN</label>
          <input
            className="input"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
          />

          <label>Confirm New PIN</label>
          <input
            className="input"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
          />

          {error ? <div style={{ marginTop: 10, color: "#ff8080", fontSize: 13 }}>{error}</div> : null}
          {done ? <div style={{ marginTop: 10, color: "#9fffa8", fontSize: 13 }}>PIN reset. Returning to login…</div> : null}

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <button className="btn" disabled={loading}>
              {loading ? "Resetting…" : "Reset PIN"}
            </button>
            <button type="button" className="btn secondary" onClick={() => nav("/login")} disabled={loading}>
              Back to login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
