import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, setToken } from "../lib/api";

export default function LoginPin() {
  const nav = useNavigate();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  const employeeId = (sessionStorage.getItem("pending_employee_id") || "").trim();

  useEffect(() => {
    if (!employeeId) nav("/login", { replace: true });
  }, [employeeId, nav]);

  useEffect(() => {
    const t = setTimeout(() => pinRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!employeeId) return setErr("Employee ID missing. Go back.");
    if (!pin.trim()) return setErr("PIN required");

    setBusy(true);
    try {
      const res = await login(employeeId, pin);
      if (!res.ok) return setErr(res.error);
      setToken(res.token, res.expires_at);
      sessionStorage.removeItem("pending_employee_id");
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="h1">Enter PIN</div>
        <div className="muted">Employee ID: <span style={{ fontWeight: 700 }}>{employeeId}</span></div>

        <form onSubmit={onSubmit}>
          <label>PIN</label>
          <input
            ref={pinRef}
            className="input"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4 digits"
          />

          {err ? <div style={{ marginTop: 10, color: "#ff8b8b" }}>{err}</div> : null}

          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn" disabled={busy} type="submit">
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <Link to="/login" className="btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              Back
            </Link>
          </div>
        </form>

        <div className="muted" style={{ marginTop: 12 }}>
          Forgot your PIN? Go back and use <b>Reset PIN</b>.
        </div>
      </div>
    </div>
  );
}
