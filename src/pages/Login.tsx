import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { setToken } from "../lib/auth";

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
      // login(employee_id, pin)
      const res = await login(eid, p);

      if (!res.ok) {
        setError(res.error || "Login failed.");
        return;
      }

      setToken(res.data.token);
      nav("/tickets");
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Login</h1>

        <form onSubmit={onSubmit} className="form">
          <label>
            Employee ID
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoComplete="username"
              inputMode="numeric"
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
            />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <button type="button" className="btn secondary" onClick={() => nav("/reset-pin")} disabled={loading} style={{ marginTop: 10 }}>
            Reset PIN
          </button>
        </form>
      </div>
    </div>
  );
}
