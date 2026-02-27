import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../lib/api";

type Project = any;

function isClosed(p: Project): boolean {
  const s = (p?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!p?.closed_at || !!p?.closedAt;
}

function parseDate(v: any): number {
  const ms = Date.parse(v || "");
  return Number.isFinite(ms) ? ms : 0;
}

function fmtDateTime(v: any): string {
  const ms = parseDate(v);
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

function dueInfo(p: Project): { label: string; variant: "danger" | "warn" | "success" | "neutral" } | null {
  if (isClosed(p)) return { label: "Closed", variant: "neutral" };
  const due = parseDate(p?.sla_due_at || p?.slaDueAt || p?.sla_due || p?.slaDue);
  if (!due) return null;
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);

  const fmt = () => {
    if (mins < 60) return `${mins}m`;
    if (hours < 48) return `${hours}h`;
    return `${days}d`;
  };

  if (diff < 0) return { label: `Overdue ${fmt()}`, variant: "danger" };
  if (diff < 6 * 60 * 60 * 1000) return { label: `Due ${fmt()}`, variant: "warn" };
  return { label: `Due ${fmt()}`, variant: "success" };
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

  useEffect(() => {
    void load();
  }, []);

  const { openProjects, closedProjects } = useMemo(() => {
    const open: Project[] = [];
    const closed: Project[] = [];
    for (const p of projects) (isClosed(p) ? closed : open).push(p);
    const sortFn = (a: any, b: any) => {
      const ta = parseDate(a?.created_at || a?.createdAt);
      const tb = parseDate(b?.created_at || b?.createdAt);
      return tb - ta;
    };
    open.sort(sortFn);
    closed.sort(sortFn);
    return { openProjects: open, closedProjects: closed };
  }, [projects]);

  
  const perPage = 10;

  const openAll = projects.filter((p) => p.status === "open");
  const closedAll = projects.filter((p) => p.status !== "open");

  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);

  useEffect(() => {
    setOpenPage(1);
    setClosedPage(1);
  }, [projects.length]);

  const openTotalPages = Math.max(1, Math.ceil(openAll.length / perPage));
  const closedTotalPages = Math.max(1, Math.ceil(closedAll.length / perPage));

  const openProjects = openAll.slice((openPage - 1) * perPage, openPage * perPage);
  const closedProjects = closedAll.slice((closedPage - 1) * perPage, closedPage * perPage);

  const renderPagination = (total: number, page: number, setPage: (n: number) => void) => {
    if (total <= 1) return null;
    return (
      <div className="pagination" aria-label="Pagination">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={"page-btn" + (n === page ? " active" : "")}
            onClick={() => setPage(n)}
            type="button"
          >
            {n}
          </button>
        ))}
      </div>
    );
  };
return (
    <div className="page">
      <h1 className="page-title">Projects</h1>
      <div className="page-subtitle">Longer work with SLA tracking and history.</div>

      <div style={{ marginTop: 12 }}>
        <Link className="btn primary" to="/projects/new">Create project</Link>
      </div>

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-head">
            <h2 className="section-title">Open</h2>
            <span className="count-pill">{openAll.length} active</span>
          </div>

          {openProjects.length === 0 ? (
            <div className="muted">No open projects.</div>
          ) : (
            <div className="cards">
              {openProjects.map((p) => {
                const due = dueInfo(p);
                const created = fmtDateTime(p?.created_at || p?.createdAt);
                const createdBy = p?.created_by_name || p?.createdByName || p?.employee_name || p?.employeeName || "";
                const tag = (p?.tag || "").toString();
                return (
                  <Link key={p.id} className="item-card" to={`/projects/${p.id}`}>
                    <div className="item-top">
                      <div className="item-title">{p.title || "Untitled project"}</div>
                      {tag ? <span className="chip neutral">{tag}</span> : null}
                    </div>

                    <div className="item-sub">
                      {p.location ? <span>{p.location}</span> : <span className="muted">No location</span>}
                      {created ? <span className="dot">•</span> : null}
                      {created ? <span>Created {created}</span> : null}
                    </div>

                    <div className="chip-row">
                      {due ? <span className={`chip ${due.variant}`}>{due.label}</span> : null}
                      {createdBy ? <span className="chip neutral">{createdBy}</span> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {renderPagination(openTotalPages, openPage, setOpenPage)}

          <div className="section-head" style={{ marginTop: 18 }}>
            <h2 className="section-title">Closed / Past</h2>
            <span className="count-pill">{closedAll.length}</span>
          </div>

          {closedProjects.length === 0 ? (
            <div className="muted">No closed projects.</div>
          ) : (
            <div className="cards">
              {closedProjects.map((p) => {
                const due = dueInfo(p);
                const created = fmtDateTime(p?.created_at || p?.createdAt);
                const createdBy = p?.created_by_name || p?.createdByName || p?.employee_name || p?.employeeName || "";
                const tag = (p?.tag || "").toString();
                return (
                  <Link key={p.id} className="item-card" to={`/projects/${p.id}`}>
                    <div className="item-top">
                      <div className="item-title">{p.title || "Untitled project"}</div>
                      {tag ? <span className="chip neutral">{tag}</span> : null}
                    </div>

                    <div className="item-sub">
                      {p.location ? <span>{p.location}</span> : <span className="muted">No location</span>}
                      {created ? <span className="dot">•</span> : null}
                      {created ? <span>Created {created}</span> : null}
                    </div>

                    <div className="chip-row">
                      {due ? <span className={`chip ${due.variant}`}>{due.label}</span> : <span className="chip neutral">Closed</span>}
                      {createdBy ? <span className="chip neutral">{createdBy}</span> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}          {renderPagination(closedTotalPages, closedPage, setClosedPage)}


