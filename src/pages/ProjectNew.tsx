import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createProject } from "../lib/api";

export default function ProjectNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !location.trim()) {
      setError("Title and location required");
      return;
    }

    if (!details.trim()) {
      setError("Details required");
      return;
    }

    setLoading(true);
    try {
      await createProject({
        title: title.trim(),
        location: location.trim(),
        description: details.trim(), // ✅ FIX: send as description (API expects description)
      });

      nav("/projects");
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
          <label className="label">
            Project title
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label className="label">
            Location
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </label>

          <label className="label">
            Details
            <textarea
              className="textarea"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              required
            />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create project (SLA 14 days)"}
          </button>

          <div className="hint">You can add photos after creating.</div>
        </form>
      </div>
    </div>
  );
}
