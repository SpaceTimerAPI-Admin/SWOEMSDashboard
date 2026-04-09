import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../lib/api";
import { getProfile } from "../lib/auth";

type Project = any;

function isClosed(p: Project): boolean {
  return ["closed", "done"].includes((p?.status || "").toLowerCase()) || !!p?.closed_at;
}

function parseDate(v: any): number {
  const ms = Date.parse(v || "");
  return Number.isFinite(ms) ? ms : 0;
}

function fmtDateTime(v: any): string {
  const ms = parseDate(v);
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function dueInfo(p: Project) {
  if (isClosed(p)) return { label: "Closed", variant: "neutral" as const };
  const due = parseDate(p?.sla_due_at);
  if (!due) return null;
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  const fmt = abs < 3600000 ? `${Math.round(abs/60000)}m` : abs < 172800000 ? `${Math.round(abs/3600000)}h` : `${Math.round(abs/86400000)}d`;
  if (diff < 0) return { label: `Overdue ${fmt}`, variant: "danger" as const };
  if (diff < 6 * 3600000) return { label: `Due ${fmt}`, variant: "warn" as const };
  return { label: `Due ${fmt}`, variant: "success" as const };
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myOnly, setMyOnly] = useState(false);
  const profile = getProfile();

  async function load() {
    setLoading(true); setError(null);
    try {
      const res: any = await listProjects({ includeClosed: true });
      if (!res?.ok) throw new Error(res?.error || "Failed to load");
      setProjects(res?.projects || res?.data?.projects || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load projects");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const { openAll, closedAll } = useMemo(() => {
    const source = myOnly ? projects.filter(p => p.assigned_to === profile?.id) : projects;
    const open: Project[] = [], closed: Project[] = [];
    for (const p of source) (isClosed(p) ? closed : open).push(p);
    const sort = (a: any, b: any) => parseDate(b.created_at) - parseDate(a.created_at);
    return { openAll: open.sort(sort), closedAll: closed.sort(sort) };
  }, [projects, myOnly, profile?.id]);

  const perPage = 10;
  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  useEffect(() => { setOpenPage(1); setClosedPage(1); }, [projects.length, myOnly]);

  const openProjects   = openAll.slice((openPage - 1) * perPage, openPage * perPage);
  const closedProjects = closedAll.slice((closedPage - 1) * perPage, closedPage * perPage);

  function Pagination({ total, page, setPage }: { total: number; page: number; setPage: (n: number) => void }) {
    if (total <= 1) return null;
    return (
      <div className="pagination">
        {Array.from({ length: total }, (_, i) => i + 1).map(n => (
          <button key={n} className={"page-btn" + (n === page ? " active" : "")} onClick={() => setPage(n)}>{n}</button>
        ))}
      </div>
    );
  }

  function ProjectCard({ p }: { p: Project }) {
    const due = dueInfo(p);
    const tag = p?.tag || "";
    const assignedName = p?.assigned_to_name || "";
    const isAssignedToMe = p?.assigned_to === profile?.id;
    return (
      <Link key={p.id} className="item-card" to={`/projects/${p.id}`}
        style={isAssignedToMe ? { borderLeft: "3px solid rgba(92,107,255,0.5)" } : undefined}>
        <div className="item-top">
          <div className="item-title">{p.title || "Untitled"}</div>
          {tag ? <span className="chip neutral">{tag}</span> : null}
        </div>
        <div className="item-sub">
          {p.location && <span>{p.location}</span>}
          {p.created_at && <><span className="dot">•</span><span>{fmtDateTime(p.created_at)}</span></>}
        </div>
        <div className="chip-row">
          {due && <span className={`chip ${due.variant}`}>{due.label}</span>}
          {assignedName && (
            <span className="chip neutral" style={isAssignedToMe ? { background: "rgba(92,107,255,0.15)", color: "#B0B8FF" } : undefined}>
              {isAssignedToMe ? "📌 You" : `📌 ${assignedName}`}
            </span>
          )}
        </div>
      </Link>
    );
  }

  const myCount = projects.filter(p => p.assigned_to === profile?.id && !isClosed(p)).length;

  return (
    <div className="page">
      <div style={{ marginBottom: 4 }}>
        <h1 className="page-title">Projects</h1>
        <div className="page-subtitle">Longer work with SLA tracking.</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, marginBottom: 4 }}>
        <button onClick={() => setMyOnly(false)} style={{
          padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid",
          borderColor: !myOnly ? "rgba(92,107,255,0.4)" : "var(--border)",
          background: !myOnly ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
          color: !myOnly ? "#B0B8FF" : "var(--muted)",
        }}>All Projects</button>
        <button onClick={() => setMyOnly(true)} style={{
          padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid",
          borderColor: myOnly ? "rgba(92,107,255,0.4)" : "var(--border)",
          background: myOnly ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
          color: myOnly ? "#B0B8FF" : "var(--muted)",
        }}>
          My Projects {myCount > 0 ? <span style={{ marginLeft: 4, background: "rgba(92,107,255,0.3)", borderRadius: 99, padding: "0 6px", fontSize: 11 }}>{myCount}</span> : null}
        </button>
      </div>

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-head">
            <h2 className="section-title">Open</h2>
            <span className="count-pill">{openAll.length} active</span>
          </div>
          {openProjects.length === 0
            ? <div className="muted">{myOnly ? "No projects assigned to you." : "No open projects."}</div>
            : <div className="cards">{openProjects.map(p => <ProjectCard key={p.id} p={p} />)}</div>}
          <Pagination total={Math.max(1, Math.ceil(openAll.length / perPage))} page={openPage} setPage={setOpenPage} />

          <div className="section-head" style={{ marginTop: 18 }}>
            <h2 className="section-title">Closed / Past</h2>
            <span className="count-pill">{closedAll.length}</span>
          </div>
          {closedProjects.length === 0
            ? <div className="muted">No closed projects.</div>
            : <div className="cards">{closedProjects.map(p => <ProjectCard key={p.id} p={p} />)}</div>}
          <Pagination total={Math.max(1, Math.ceil(closedAll.length / perPage))} page={closedPage} setPage={setClosedPage} />
        </>
      )}
    </div>
  );
}
