import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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
    if (!payload.tag) return setError("Tag required");

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
    <div className="page">
      <h1>Create Project</h1>

      <form onSubmit={onSubmit} className="card" style={{ marginTop: 12 }}>
        <label>
          Project title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label>
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>

        <label style={{ marginTop: 10 }}>Tag</label>
        <div className="chip-row">
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className={"chip" + (tag === t ? " active" : "")}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <label style={{ marginTop: 12 }}>
          Details
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={5}
          />
        </label>

        {error && (
          <div className="error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        <button
          className="btn primary"
          style={{ marginTop: 12 }}
          disabled={loading}
        >
          {loading ? "Creating..." : "Create project"}
        </button>
      </form>
    </div>
  );
}
