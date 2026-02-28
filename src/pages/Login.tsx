import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../lib/api";

export default function Login() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const eid = employeeId.trim();
    const p = pin.trim();

    if (!eid || !p) {
      setError("Employee ID and PIN are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await login(eid, p);
      if (!res.ok) {
        setError(res.error || "Login failed.");
        return;
      }
      nav("/tickets");
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--text)" }}>SWOEMS</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>Sign in to your account</div>
        </div>

        <div className="card" style={{ padding: "20px" }}>
          <form onSubmit={onSubmit}>
            <label>
              <div className="field-label">Employee ID</div>
              <input
                className="input"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                autoComplete="username"
                inputMode="numeric"
                placeholder="e.g. 12345"
              />
            </label>

            <label style={{ marginTop: 2 }}>
              <div className="field-label">PIN</div>
              <input
                className="input"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type="password"
                autoComplete="current-password"
                inputMode="numeric"
                placeholder="••••"
              />
            </label>

            {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

            <button className="btn primary full" style={{ marginTop: 16 }} disabled={loading}>
              {loading ? <><span className="spinner" /> Signing in…</> : "Sign in"}
            </button>
          </form>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <Link to="/reset-pin" style={{ fontSize: 13, color: "var(--muted)" }}>Reset PIN</Link>
            <Link to="/enroll" style={{ fontSize: 13, color: "var(--muted)" }}>Enroll →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
