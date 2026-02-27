import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createProject } from "../lib/api";

export default function ProjectNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      title: title.trim(),
      location: location.trim(),
      details: details.trim(),
    };

    if (!payload.title) return setError("Title required");
    if (!payload.location) return setError("Location required");
    if (!payload.details) return setError("Details required");

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
      <div className="card">
        <h1>Create Project</h1>

        <form onSubmit={onSubmit} className="form">
          <label>
            Project title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label>
            Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>

          <label>
            Details
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={8} />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn primary" disabled={loading}>
            {loading ? "Creating..." : "Create project (SLA 14 days)"}
          </button>

          <div className="muted" style={{ marginTop: 8 }}>
            You can add photos after creating.
          </div>
        </form>
      </div>
    </div>
  );
}
