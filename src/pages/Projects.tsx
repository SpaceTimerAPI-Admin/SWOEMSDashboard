import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../lib/api";

type Project = any;

function isClosed(p: Project): boolean {
  const s = (p?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!p?.closed_at || !!p?.closedAt;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await listProjects({ includeClosed: true });
      if (!res?.ok) throw new Error(res?.error || "Failed to load projects");
      setProjects(res?.projects || res?.data?.projects || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const { openProjects, closedProjects } = useMemo(() => {
    const open: Project[] = [];
    const closed: Project[] = [];
    for (const p of projects) (isClosed(p) ? closed : open).push(p);
    const sortFn = (a: any, b: any) => {
      const ta = Date.parse(a?.created_at || a?.createdAt || "") || 0;
      const tb = Date.parse(b?.created_at || b?.createdAt || "") || 0;
      return tb - ta;
    };
    open.sort(sortFn);
    closed.sort(sortFn);
    return { openProjects: open, closedProjects: closed };
  }, [projects]);

  return (
    <div className="page">
      <div className="row between">
        <h1>Projects</h1>
        <Link className="btn primary inline" to="/projects/new">Create project</Link>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <>
          <h2>Open</h2>
          {openProjects.length === 0 ? (
            <div className="muted">No open projects.</div>
          ) : (
            <div className="list">
              {openProjects.map((p) => (
                <Link key={p.id} className="list-item" to={`/projects/${p.id}`}>
                  <div className="title">{p.title}</div>
                  <div className="meta">{p.location}</div>
                </Link>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 24 }}>Closed / Past</h2>
          {closedProjects.length === 0 ? (
            <div className="muted">No closed projects.</div>
          ) : (
            <div className="list">
              {closedProjects.map((p) => (
                <Link key={p.id} className="list-item" to={`/projects/${p.id}`}>
                  <div className="title">{p.title}</div>
                  <div className="meta">{p.location}</div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
