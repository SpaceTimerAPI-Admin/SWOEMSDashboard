import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createProject } from "../lib/api";

const TAGS = ["Lighting", "Sound", "Video", "Rides", "Misc"] as const;

export default function ProjectNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [tag, setTag] = useState<(typeof TAGS)[number] | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: any = {
      title: title.trim(),
      location: location.trim(),
      details: details.trim(),
      tag: tag || undefined,
    };

    if (!payload.title) return setError("Title required");
    if (!payload.location) return setError("Location required");
    if (!payload.details) return setError("Details required");
    if (!payload.tag) return setError("Please select a tag");

    setLoading(true);
    try {
      const res: any = await createProject(payload);
      if (!res?.ok) throw new Error(res?.error || "Failed to create project");
      const data = res.data ?? res;
      const project = data?.project || data?.data?.project || data?.project;
      if (project?.id) nav(`/projects/${project.id}`);
      else nav("/projects");
    } catch (e: any) {
      setError(e?.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page fade-up">
      <Link to="/projects" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Projects
      </Link>

      <div className="page-title">New Project</div>
      <div className="page-subtitle">SLA: resolve within 14 days.</div>

      <form onSubmit={onSubmit} className="card" style={{ padding: "16px" }}>
        <label>
          <div className="field-label">Title</div>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Project name"
          />
        </label>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Location</div>
          <input
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where?"
          />
        </label>

        <div style={{ marginTop: 2 }}>
          <div className="field-label">Category</div>
          <div className="tag-row">
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-btn${tag === t ? " active" : ""}`}
                onClick={() => setTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <label style={{ marginTop: 2 }}>
          <div className="field-label">Details</div>
          <textarea
            className="textarea"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            placeholder="Describe the project…"
          />
        </label>

        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

        <button className="btn primary full" style={{ marginTop: 14 }} disabled={loading}>
          {loading ? <><span className="spinner" /> Creating…</> : "Create project"}
        </button>
      </form>
    </div>
  );
}
