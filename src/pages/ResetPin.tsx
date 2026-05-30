import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
      setTimeout(() => nav("/login"), 1400);
    } catch (err: any) {
      setError(err?.message || "Could not reset PIN.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--text)" }}>Reset PIN</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
            Requires an admin reset code to set a new 4‑digit PIN.
          </div>
        </div>

        {done ? (
          <div className="card" style={{ padding: "28px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#7EEFC4", marginBottom: 4 }}>PIN updated!</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Redirecting to login…</div>
          </div>
        ) : (
          <div className="card" style={{ padding: "20px" }}>
            <form onSubmit={onSubmit}>

              <label>
                <div className="field-label">Employee ID</div>
                <input
                  className="input"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder="e.g. 12345"
                />
              </label>

              <label style={{ marginTop: 2 }}>
                <div className="field-label">Admin Reset Code</div>
                <input
                  className="input"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  autoComplete="one-time-code"
                  placeholder="Enter code from admin"
                />
              </label>

              {/* Divider */}
              <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0 14px" }} />

              <label>
                <div className="field-label">New 4‑digit PIN</div>
                <input
                  className="input"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="new-password"
                  placeholder="••••"
                />
              </label>

              <label style={{ marginTop: 2 }}>
                <div className="field-label">Confirm New PIN</div>
                <input
                  className="input"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="new-password"
                  placeholder="••••"
                />
              </label>

              {error && (
                <div style={{
                  marginTop: 12, padding: "9px 13px", borderRadius: 10, fontSize: 13,
                  background: "var(--danger-bg)", color: "#FFB0B0",
                  border: "1px solid rgba(255,84,84,0.25)",
                }}>
                  {error}
                </div>
              )}

              <button className="btn primary full" style={{ marginTop: 16 }} type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Resetting…</> : "Reset PIN"}
              </button>
            </form>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", textAlign: "center" }}>
              <Link to="/login" style={{ fontSize: 13, color: "var(--muted)" }}>← Back to login</Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
