import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { enroll } from "../lib/api";

export default function Enroll() {
  const nav = useNavigate();
  const [enrollment_code, setCode] = useState("");
  const [employee_id, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await enroll({ enrollment_code, employee_id, name, email, pin });
      nav("/login");
    } catch (e: any) {
      setErr(e.message || "Enroll failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div className="h1">Enroll</div>
        <div className="muted">Requires your enrollment code.</div>

        <form onSubmit={onSubmit}>
          <label>Enrollment Code</label>
          <input className="input" value={enrollment_code} onChange={(e)=>setCode(e.target.value)} />
          <label>Employee ID</label>
          <input className="input" inputMode="numeric" value={employee_id} onChange={(e)=>setEmployeeId(e.target.value)} />
          <label>Name</label>
          <input className="input" value={name} onChange={(e)=>setName(e.target.value)} />
          <label>Email (for EOD report)</label>
          <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <label>4-digit PIN</label>
          <input className="input" inputMode="numeric" maxLength={4} value={pin} onChange={(e)=>setPin(e.target.value)} />

          {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}
          <div style={{marginTop:12}}>
            <button className="btn" disabled={busy}>{busy ? "Enrolling..." : "Create account"}</button>
          </div>
        </form>

        <div style={{marginTop:12}} className="muted">
          <Link to="/login">Back to login</Link>
        </div>
      </div>
      <div className="spacer" />
    </div>
  );
}
