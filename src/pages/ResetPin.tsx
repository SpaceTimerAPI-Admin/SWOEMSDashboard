import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetPin } from "../lib/api";

export default function ResetPin() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const eid = employeeId.trim();
    const code = adminCode.trim();
    const p1 = newPin.trim();
    const p2 = confirmPin.trim();

    if (!eid || !code || !p1 || !p2) {
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
      const res = await resetPin({ employee_id: eid, admin_code: code, new_pin: p1 });
      if (!res.ok) {
        setError(res.error || "Could not reset PIN.");
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
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div className="pageTitle">Reset PIN</div>
        <div className="muted">Admin-only: enter the admin reset code to set a new 4-digit PIN.</div>

        <form onSubmit={onSubmit} className="form">
          <label>
            Employee ID
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
            />
          </label>

          <label>
            Admin Reset Code
            <input value={adminCode} onChange={(e) => setAdminCode(e.target.value)} autoComplete="one-time-code" />
          </label>

          <label>
            New 4-digit PIN
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              inputMode="numeric"
              maxLength={4}
              autoComplete="new-password"
            />
          </label>

          <label>
            Confirm PIN
            <input
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              inputMode="numeric"
              maxLength={4}
              autoComplete="new-password"
            />
          </label>

          {error ? <div className="error">{error}</div> : null}
          {done ? <div className="success">PIN updated. Redirecting…</div> : null}

          <button className="btnPrimary" type="submit" disabled={loading}>
            {loading ? "Resetting…" : "Reset PIN"}
          </button>

          <button className="btnGhost" type="button" onClick={() => nav("/login")} disabled={loading} style={{ marginTop: 10 }}>
            Back to Login
          </button>
        </form>
      </div>
      <div className="spacer" />
    </div>
  );
}
