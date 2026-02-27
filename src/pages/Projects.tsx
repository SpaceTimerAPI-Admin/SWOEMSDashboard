import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../lib/api";

type Project = any;

function isClosed(p: Project): boolean {
  const s = (p?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!p?.closed_at || !!p?.closedAt;
}

function fmtDate(d?: string): string {
  if (!d) return "";
  const ms = Date.parse(d);
  if (!ms) return d;
  return new Date(ms).toLocaleString([], { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

function humanMs(ms: number): string {
  const a = Math.abs(ms);
  const mins = Math.round(a / 60000);
  if (mins < 1) return "seconds";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

function slaLabel(p: any): { cls: string; text: string } {
  const status = (p?.status || "").toString().toLowerCase();
  if (status === "closed") return { cls: "neutral", text: "Closed" };

  const msLeft = typeof p?.ms_left === "number" ? p.ms_left : (p?.sla_due_at ? Date.parse(p.sla_due_at) - Date.now() : NaN);
  if (!isFinite(msLeft)) return { cls: "neutral", text: "No SLA" };

  if (msLeft < 0) return { cls: "bad", text: `Overdue ${humanMs(msLeft)}` };
  if (msLeft <= 24 * 60 * 60 * 1000) return { cls: "warn", text: `Due ${humanMs(msLeft)}` };
  return { cls: "good", text: `Due ${humanMs(msLeft)}` };
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
      setProjects(res?.data?.projects || res?.projects || []);
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
      const am = typeof a?.ms_left === "number" ? a.ms_left : 0;
      const bm = typeof b?.ms_left === "number" ? b.ms_left : 0;
      if (a?.is_overdue !== b?.is_overdue) return a?.is_overdue ? -1 : 1;
      if (am !== bm) return am - bm;
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
      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Projects</h1>
          <div className="muted">Longer work with SLA tracking and history.</div>
        </div>
        <Link className="btn inline" to="/projects/new">Create project</Link>
      </div>

      {loading && <div className="muted" style={{ marginTop: 14 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-title">
            <h2 style={{ marginBottom: 0 }}>Open</h2>
            <span className="badge neutral">{openProjects.length} active</span>
          </div>

          {openProjects.length === 0 ? (
            <div className="muted">No open projects.</div>
          ) : (
            <div className="list">
              {openProjects.map((p) => {
                const sla = slaLabel(p);
                return (
                  <Link key={p.id} className="list-item" to={`/projects/${p.id}`}>
                    <div className="item-top">
                      <div className="grow">
                        <div className="title">{p.title || "Untitled project"}</div>
                        <div className="meta">{p.location || "No location"} • Created {fmtDate(p.created_at)}</div>
                        {p.source_ticket_id && (
                          <div className="meta">From ticket #{p.source_ticket_id}</div>
                        )}
                      </div>
                      <div className="badges">
                        <span className={"badge " + sla.cls}>{sla.text}</span>
                        <span className="badge">{(p.created_by_name || p.created_by || "—")}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="section-title" style={{ marginTop: 18 }}>
            <h2 style={{ marginBottom: 0 }}>Closed / Past</h2>
            <span className="badge neutral">{closedProjects.length}</span>
          </div>

          {closedProjects.length === 0 ? (
            <div className="muted">No closed projects.</div>
          ) : (
            <div className="list">
              {closedProjects.map((p) => (
                <Link key={p.id} className="list-item" to={`/projects/${p.id}`}>
                  <div className="item-top">
                    <div className="grow">
                      <div className="title">{p.title || "Untitled project"}</div>
                      <div className="meta">{p.location || "No location"} • Created {fmtDate(p.created_at)}</div>
                    </div>
                    <div className="badges">
                      <span className="badge neutral">Closed</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <div className="spacer" />
    </div>
  );
}
