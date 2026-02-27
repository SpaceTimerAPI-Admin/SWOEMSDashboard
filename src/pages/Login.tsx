import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPin } from "../lib/api";

export default function Login() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => { idRef.current?.focus(); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    const id = employeeId.trim();
    if (!id) return setErr("Employee ID required");
    sessionStorage.setItem("pending_employee_id", id);
    nav("/login/pin");
  }

  async function onResetPin() {
    setErr(null);
    setInfo(null);
    const id = employeeId.trim();
    if (!id) return setErr("Enter your Employee ID first");
    setBusy(true);
    try {
      const res = await resetPin(id);
      if (!res.ok) return setErr(res.error);
      setInfo("Temporary PIN sent to your email.");
    } catch (e: any) {
      setErr(e.message || "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div className="h1">Maintenance Dashboard</div>
        <div className="muted">Enter your Employee ID to continue.</div>

        <form onSubmit={onSubmit}>
          <label>Employee ID</label>
          <input ref={idRef} className="input" inputMode="numeric" value={employeeId} onChange={(e)=>setEmployeeId(e.target.value)} placeholder="Type ID" />
          {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}
          {info ? <div style={{marginTop:10,color:"#8bffb0"}}>{info}</div> : null}
          <div style={{marginTop:12}}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Working..." : "Continue"}</button>
              <button className="btn" type="button" onClick={onResetPin} disabled={busy}>Reset PIN</button>
            </div>
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
