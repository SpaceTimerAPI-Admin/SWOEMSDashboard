import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createProject } from "../lib/api";

export default function ProjectNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await createProject({ title, location, details, sla_days: 14 });
      nav(`/projects/${res.project.id}`);
    } catch (e: any) {
      setErr(e.message || "Failed to create project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="h1">Create Project</div>
      <div className="card">
        <form onSubmit={onSubmit}>
          <label>Project title</label>
          <input className="input" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Short summary" />
          <label>Location</label>
          <input className="input" value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="Area / attraction / zone" />
          <label>Details</label>
          <textarea className="input" style={{minHeight:140}} value={details} onChange={(e)=>setDetails(e.target.value)} placeholder="What is the long-term issue?" />
          {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}
          <div style={{marginTop:12}}>
            <button className="btn" disabled={busy}>{busy ? "Creating..." : "Create project (SLA 14 days)"}</button>
          </div>
          <div style={{marginTop:10}} className="muted">You can add photos after creating.</div>
        </form>
      </div>
      <div className="spacer" />
    </div>
  );
}
