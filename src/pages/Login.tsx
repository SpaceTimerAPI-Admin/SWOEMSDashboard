import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, setToken } from "../lib/api";

export default function Login() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => { idRef.current?.focus(); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await login(employeeId, pin);
      setToken(res.token, res.expires_at);
      nav("/");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div className="h1">Maintenance Dashboard</div>
        <div className="muted">Scan badge or enter Employee ID, then your 4-digit PIN.</div>

        <form onSubmit={onSubmit}>
          <label>Employee ID</label>
          <input ref={idRef} className="input" inputMode="numeric" value={employeeId} onChange={(e)=>setEmployeeId(e.target.value)} placeholder="Scan or type ID" />
          <label>PIN</label>
          <input className="input" inputMode="numeric" maxLength={4} value={pin} onChange={(e)=>setPin(e.target.value)} placeholder="4 digits" />
          {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}
          <div style={{marginTop:12}}>
            <button className="btn" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
          </div>
        </form>

        <div style={{marginTop:12}} className="muted">
          New user? <Link to="/enroll">Enroll</Link>
        </div>
      </div>
      <div className="spacer" />
    </div>
  );
}
