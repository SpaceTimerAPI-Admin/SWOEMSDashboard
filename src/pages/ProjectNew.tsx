import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createProject } from "../lib/api";

export default function ProjectNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [tag, setTag] = useState<"Lighting"|"Sound"|"Video"|"Rides"|"Misc">("Misc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      title: title.trim(),
      location: location.trim(),
      details: details.trim(),
      tag,
    };

    if (!payload.title) return setError("Title required");
    if (!payload.location) return setError("Location required");
    if (!payload.details) return setError("Details required");
    if (!payload.tag) return setError("Category required");

    setLoading(true);
    try {
      const res: any = await createProject(payload);
      if (!res?.ok) throw new Error(res?.error || "Failed to create project");
      const project = res?.project || res?.data?.project;
      if (project?.id) nav(`/projects/${project.id}`);
      else nav("/projects");
    } catch (err: any) {
      setError(err?.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      
      <div className="field" style={{ marginTop: 10 }}>
        <div className="label">Category</div>
        <div className="chips" style={{ marginTop: 8 }}>
          {(["Lighting","Sound","Video","Rides","Misc"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${tag === t ? "active" : ""}`}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="hint">Required. Used for reporting and end-of-day grouping.</div>
      </div>

<div className="row between wrap" style={{ gap: 10 }}>
        <Link className="btn inline ghost" to="/projects">← Back</Link>
        <span className="badge neutral">SLA 7 days</span>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h1 style={{ marginBottom: 8 }}>Create Project</h1>
        <div className="muted">Projects are longer work items with updates, photos, and a due date.</div>

        <form onSubmit={onSubmit} className="form" style={{ marginTop: 12 }}>
          <label>
            Project title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </label>

          <label>
            Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where is this happening?" />
          </label>

          <label>
            Details
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={7} placeholder="What’s the scope? Any blockers or parts needed?" />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn" disabled={loading}>
            {loading ? "Creating..." : "Create project"}
          </button>
        </form>
      </div>

      <div className="spacer" />
    </div>
  );
}
