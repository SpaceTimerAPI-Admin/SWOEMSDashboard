import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../lib/api";

type Project = any;

function isClosed(p: Project): boolean {
  const s = (p?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!p?.closed_at || !!p?.closedAt;
}

function fmtWhen(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function minutesBetween(nowMs: number, futureMs: number): number {
  return Math.round((futureMs - nowMs) / 60000);
}

function slaPill(p: any): { text: string; tone: "ok" | "warn" | "bad" | "closed" } {
  const status = (p?.status || "").toString().toLowerCase();
  if (status === "closed" || status === "done" || p?.closed_at || p?.closedAt) {
    return { text: "Closed", tone: "closed" };
  }

  const dueIso = p?.sla_due_at || p?.slaDueAt || p?.due_at || p?.dueAt;
  const dueMs = dueIso ? Date.parse(dueIso) : NaN;
  if (!Number.isFinite(dueMs)) return { text: "SLA", tone: "ok" };

  const now = Date.now();
  const mins = minutesBetween(now, dueMs);

  const abs = Math.abs(mins);
  const d = Math.floor(abs / (60 * 24));
  const h = Math.floor((abs % (60 * 24)) / 60);
  const m = abs % 60;
  const dur = d > 0 ? `${d}d` : h > 0 ? `${h}h` : `${m}m`;

  if (mins < 0) return { text: `Overdue ${dur}`, tone: "bad" };
  if (mins <= 60) return { text: `Due ${dur}`, tone: "warn" };
  return { text: `Due ${dur}`, tone: "ok" };
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
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <div className="muted">Longer work with SLA tracking and history.</div>
        </div>
        <Link className="btn inline primary" to="/projects/new">
          Create project
        </Link>
      </div>

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-head">
            <h2>Open</h2>
            <span className="pill">{openProjects.length} active</span>
          </div>

          {openProjects.length === 0 ? (
            <div className="muted">No open projects.</div>
          ) : (
            <div className="cards">
              {openProjects.map((p) => {
                const sla = slaPill(p);
                const created = fmtWhen(p?.created_at || p?.createdAt);
                const who = p?.created_by_name || p?.createdByName || p?.employee_name || p?.employeeName;
                const tag = p?.tag;
                return (
                  <Link key={p.id} className="cardlink" to={`/projects/${p.id}`}>
                    <div className="carditem">
                      <div className="cardtop">
                        <div className="cardtitle">{p.title || "(Untitled)"}</div>
                        <div className="pillrow">
                          {tag && <span className="pill tone">{tag}</span>}
                          <span className={`pill sla ${sla.tone}`}>{sla.text}</span>
                        </div>
                      </div>
                      <div className="cardsub">
                        {p.location ? <span>{p.location}</span> : <span className="muted">No location</span>}
                        {created ? <span className="dot">•</span> : null}
                        {created ? <span className="muted">Created {created}</span> : null}
                      </div>
                      {p?.source_ticket_id ? (
                        <div className="cardmeta">
                          <span className="muted">From ticket</span>
                          <span className="pill soft">#{p.source_ticket_id}</span>
                        </div>
                      ) : who ? (
                        <div className="cardmeta"><span className="pill soft">{who}</span></div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="section-head" style={{ marginTop: 22 }}>
            <h2>Closed / Past</h2>
            <span className="pill">{closedProjects.length}</span>
          </div>

          {closedProjects.length === 0 ? (
            <div className="muted">No closed projects.</div>
          ) : (
            <div className="cards">
              {closedProjects.map((p) => {
                const sla = slaPill({ ...p, status: "closed" });
                const created = fmtWhen(p?.created_at || p?.createdAt);
                const who = p?.created_by_name || p?.createdByName || p?.employee_name || p?.employeeName;
                const tag = p?.tag;
                return (
                  <Link key={p.id} className="cardlink" to={`/projects/${p.id}`}>
                    <div className="carditem">
                      <div className="cardtop">
                        <div className="cardtitle">{p.title || "(Untitled)"}</div>
                        <div className="pillrow">
                          {tag && <span className="pill tone">{tag}</span>}
                          <span className={`pill sla ${sla.tone}`}>{sla.text}</span>
                        </div>
                      </div>
                      <div className="cardsub">
                        {p.location ? <span>{p.location}</span> : <span className="muted">No location</span>}
                        {created ? <span className="dot">•</span> : null}
                        {created ? <span className="muted">Created {created}</span> : null}
                      </div>
                      {who ? <div className="cardmeta"><span className="pill soft">{who}</span></div> : null}
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
}
