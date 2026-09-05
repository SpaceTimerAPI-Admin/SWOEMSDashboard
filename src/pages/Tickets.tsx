import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets, listProjects } from "../lib/api";
import { getProfile, getRole } from "../lib/auth";

type WorkOrder = any;

function isClosed(t: WorkOrder): boolean {
  return ["closed", "done"].includes((t?.status || "").toLowerCase()) || !!t?.closed_at;
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

function dueInfo(t: WorkOrder) {
  if (isClosed(t)) return { label: "Closed", variant: "neutral" as const };
  const due = parseDate(t?.sla_due_at);
  if (!due) return null;
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  const fmt = abs < 3600000 ? `${Math.round(abs/60000)}m` : abs < 172800000 ? `${Math.round(abs/3600000)}h` : `${Math.round(abs/86400000)}d`;
  if (diff < 0) return { label: `Overdue ${fmt}`, variant: "danger" as const };
  if (diff < 3600000) return { label: `Due ${fmt}`, variant: "warn" as const };
  return { label: `Due ${fmt}`, variant: "success" as const };
}

export default function Tickets() {
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myOnly, setMyOnly] = useState(false);
  const profile = getProfile();
  const role = getRole();
  const isShowTech = role === "show_tech";

  async function load() {
    setLoading(true); setError(null);
    try {
      const [tr, pr] = await Promise.all([
        listTickets({ includeClosed: true }) as any,
        listProjects({ includeClosed: true }) as any,
      ]);
      if (!tr?.ok) throw new Error(tr?.error || "Failed to load");
      const tickets = (tr?.tickets || tr?.data?.tickets || []).map((t: any) => ({ ...t, _type: "ticket" }));
      const projects = (pr?.ok ? (pr?.projects || pr?.data?.projects || []) : []).map((p: any) => ({ ...p, _type: "project" }));
      // Merge and sort by SLA due date
      const merged = [...tickets, ...projects].sort((a, b) => parseDate(a.sla_due_at) - parseDate(b.sla_due_at));
      setItems(merged);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const { openAll, closedAll } = useMemo(() => {
    const source = myOnly ? items.filter(t => t.assigned_to === profile?.id) : items;
    const open: WorkOrder[] = [], closed: WorkOrder[] = [];
    for (const t of source) (isClosed(t) ? closed : open).push(t);
    // Open: sort by SLA due (soonest first), closed: sort by closed_at (newest first)
    return {
      openAll: open.sort((a, b) => parseDate(a.sla_due_at) - parseDate(b.sla_due_at)),
      closedAll: closed.sort((a, b) => parseDate(b.closed_at || b.created_at) - parseDate(a.closed_at || a.created_at)),
    };
  }, [items, myOnly, profile?.id]);

  const perPage = 10;
  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  useEffect(() => { setOpenPage(1); setClosedPage(1); }, [items.length, myOnly]);

  const openItems   = openAll.slice((openPage - 1) * perPage, openPage * perPage);
  const closedItems = closedAll.slice((closedPage - 1) * perPage, closedPage * perPage);

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

  function WorkOrderCard({ t }: { t: WorkOrder }) {
    const due = dueInfo(t);
    const tag = t?.tag || "";
    const assignedName = t?.assigned_to_name || "";
    const isAssignedToMe = t?.assigned_to === profile?.id;
    const submitter = t?.created_by_name || "";
    const isProject = t._type === "project";
    const href = isProject ? `/projects/${t.id}` : `/tickets/${t.id}`;
    return (
      <Link key={t.id} className="item-card" to={href}
        style={isAssignedToMe ? { borderLeft: "3px solid rgba(92,107,255,0.5)" } : undefined}>
        <div className="item-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="item-title">{t.title || "Untitled"}</div>
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
            {isProject && (
              <span className="chip neutral" style={{ fontSize: 10, opacity: 0.7 }}>Project</span>
            )}
            {tag ? <span className="chip neutral">{tag}</span> : null}
          </div>
        </div>
        <div className="item-sub">
          {t.location && <span>{t.location}</span>}
          {t.created_at && <><span className="dot">•</span><span>{fmtDateTime(t.created_at)}</span></>}
          {submitter && <><span className="dot">•</span><span>by {submitter}</span></>}
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

  const myCount = items.filter(t => t.assigned_to === profile?.id && !isClosed(t)).length;

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Work Orders</h1>
          <div className="page-subtitle">All tickets and projects — sorted by due date.</div>
        </div>
      </div>

      {!isShowTech && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 4 }}>
          <button onClick={() => setMyOnly(false)} style={{
            padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: "1px solid", transition: "all 0.15s",
            borderColor: !myOnly ? "rgba(92,107,255,0.4)" : "var(--border)",
            background: !myOnly ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
            color: !myOnly ? "#B0B8FF" : "var(--muted)",
          }}>All Work Orders</button>
          <button onClick={() => setMyOnly(true)} style={{
            padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: "1px solid", transition: "all 0.15s",
            borderColor: myOnly ? "rgba(92,107,255,0.4)" : "var(--border)",
            background: myOnly ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
            color: myOnly ? "#B0B8FF" : "var(--muted)",
          }}>
            My Work Orders {myCount > 0 ? <span style={{ marginLeft: 4, background: "rgba(92,107,255,0.3)", borderRadius: 99, padding: "0 6px", fontSize: 11 }}>{myCount}</span> : null}
          </button>
        </div>
      )}

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-head">
            <h2 className="section-title">Open</h2>
            <span className="count-pill">{openAll.length} active</span>
          </div>
          {openItems.length === 0
            ? <div className="muted">{myOnly ? "No work orders assigned to you." : "No open work orders."}</div>
            : <div className="cards">{openItems.map(t => <WorkOrderCard key={`${t._type}-${t.id}`} t={t} />)}</div>}
          <Pagination total={Math.max(1, Math.ceil(openAll.length / perPage))} page={openPage} setPage={setOpenPage} />

          <div className="section-head" style={{ marginTop: 18 }}>
            <h2 className="section-title">Closed / Past</h2>
            <span className="count-pill">{closedAll.length}</span>
          </div>
          {closedItems.length === 0
            ? <div className="muted">No closed work orders.</div>
            : <div className="cards">{closedItems.map(t => <WorkOrderCard key={`${t._type}-${t.id}`} t={t} />)}</div>}
          <Pagination total={Math.max(1, Math.ceil(closedAll.length / perPage))} page={closedPage} setPage={setClosedPage} />
        </>
      )}
    </div>
  );
}

type Ticket = any;

function isClosed(t: Ticket): boolean {
  return ["closed", "done"].includes((t?.status || "").toLowerCase()) || !!t?.closed_at;
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

function dueInfo(t: Ticket) {
  if (isClosed(t)) return { label: "Closed", variant: "neutral" as const };
  const due = parseDate(t?.sla_due_at);
  if (!due) return null;
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  const fmt = abs < 3600000 ? `${Math.round(abs/60000)}m` : abs < 172800000 ? `${Math.round(abs/3600000)}h` : `${Math.round(abs/86400000)}d`;
  if (diff < 0) return { label: `Overdue ${fmt}`, variant: "danger" as const };
  if (diff < 3600000) return { label: `Due ${fmt}`, variant: "warn" as const };
  return { label: `Due ${fmt}`, variant: "success" as const };
}

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myOnly, setMyOnly] = useState(false);
  const profile = getProfile();
  const role = getRole();
  const isShowTech = role === "show_tech";

  async function load() {
    setLoading(true); setError(null);
    try {
      const tr: any = await listTickets({ includeClosed: true });
      if (!tr?.ok) throw new Error(tr?.error || "Failed to load");
      setTickets(tr?.tickets || tr?.data?.tickets || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const { openAll, closedAll } = useMemo(() => {
    const source = myOnly ? tickets.filter(t => t.assigned_to === profile?.id) : tickets;
    const open: Ticket[] = [], closed: Ticket[] = [];
    for (const t of source) (isClosed(t) ? closed : open).push(t);
    const sort = (a: any, b: any) => parseDate(b.created_at) - parseDate(a.created_at);
    return { openAll: open.sort(sort), closedAll: closed.sort(sort) };
  }, [tickets, myOnly, profile?.id]);

  const perPage = 10;
  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  useEffect(() => { setOpenPage(1); setClosedPage(1); }, [tickets.length, myOnly]);

  const openTickets   = openAll.slice((openPage - 1) * perPage, openPage * perPage);
  const closedTickets = closedAll.slice((closedPage - 1) * perPage, closedPage * perPage);

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

  function TicketCard({ t }: { t: Ticket }) {
    const due = dueInfo(t);
    const tag = t?.tag || "";
    const assignedName = t?.assigned_to_name || "";
    const isAssignedToMe = t?.assigned_to === profile?.id;
    const submitter = t?.created_by_name || "";
    return (
      <Link key={t.id} className="item-card" to={`/tickets/${t.id}`}
        style={isAssignedToMe ? { borderLeft: "3px solid rgba(92,107,255,0.5)" } : undefined}>
        <div className="item-top">
          <div className="item-title">{t.title || "Untitled"}</div>
          {tag ? <span className="chip neutral">{tag}</span> : null}
        </div>
        <div className="item-sub">
          {t.location && <span>{t.location}</span>}
          {t.created_at && <><span className="dot">•</span><span>{fmtDateTime(t.created_at)}</span></>}
          {submitter && <><span className="dot">•</span><span>by {submitter}</span></>}
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

  const myCount = tickets.filter(t => t.assigned_to === profile?.id && !isClosed(t)).length;

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div>
          <h1 className="page-title">{isShowTech ? "Work Orders" : "Work Orders"}</h1>
          <div className="page-subtitle">{isShowTech ? "Your assigned work orders." : "Track all work orders with SLA status."}</div>
        </div>
      </div>

      {/* My Tickets toggle — hide for show_tech since they only see their items */}
      {!isShowTech && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 4 }}>
          <button
            onClick={() => setMyOnly(false)}
            style={{
              padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "1px solid", transition: "all 0.15s",
              borderColor: !myOnly ? "rgba(92,107,255,0.4)" : "var(--border)",
              background: !myOnly ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
              color: !myOnly ? "#B0B8FF" : "var(--muted)",
            }}
          >All Work Orders</button>
          <button
            onClick={() => setMyOnly(true)}
            style={{
              padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "1px solid", transition: "all 0.15s",
              borderColor: myOnly ? "rgba(92,107,255,0.4)" : "var(--border)",
              background: myOnly ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
              color: myOnly ? "#B0B8FF" : "var(--muted)",
            }}
          >
            My Work Orders {myCount > 0 ? <span style={{ marginLeft: 4, background: "rgba(92,107,255,0.3)", borderRadius: 99, padding: "0 6px", fontSize: 11 }}>{myCount}</span> : null}
          </button>
        </div>
      )}

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-head">
            <h2 className="section-title">Open</h2>
            <span className="count-pill">{openAll.length} active</span>
          </div>
          {openTickets.length === 0
            ? <div className="muted">{myOnly ? "No work orders assigned to you." : "No open work orders."}</div>
            : <div className="cards">{openTickets.map(t => <TicketCard key={t.id} t={t} />)}</div>}
          <Pagination total={Math.max(1, Math.ceil(openAll.length / perPage))} page={openPage} setPage={setOpenPage} />

          <div className="section-head" style={{ marginTop: 18 }}>
            <h2 className="section-title">Closed / Past</h2>
            <span className="count-pill">{closedAll.length}</span>
          </div>
          {closedTickets.length === 0
            ? <div className="muted">No closed work orders.</div>
            : <div className="cards">{closedTickets.map(t => <TicketCard key={t.id} t={t} />)}</div>}
          <Pagination total={Math.max(1, Math.ceil(closedAll.length / perPage))} page={closedPage} setPage={setClosedPage} />
        </>
      )}
    </div>
  );
}
