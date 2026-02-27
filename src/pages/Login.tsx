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
    <div className="page">
      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1>Login</h1>
        <div className="muted" style={{ marginBottom: 10 }}>
          Sign in with your Employee ID and 4‑digit PIN.
        </div>

        <form onSubmit={onSubmit} className="form">
          <label>
            Employee ID
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoComplete="username"
              inputMode="numeric"
              placeholder="e.g. 12345"
            />
          </label>

          <label>
            PIN
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              type="password"
              autoComplete="current-password"
              inputMode="numeric"
              placeholder="••••"
            />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <Link className="btn secondary" to="/reset-pin" style={{ textAlign: "center" }}>
            Reset PIN
          </Link>
        </form>

        <div className="muted" style={{ marginTop: 10 }}>
          New here? <Link to="/enroll" style={{ textDecoration: "underline" }}>Enroll</Link>
        </div>
      </div>
    </div>
  );
}
