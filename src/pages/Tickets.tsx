import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";

type Ticket = any;

function isClosed(t: Ticket): boolean {
  const s = (t?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!t?.closed_at || !!t?.closedAt;
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

function dueInfo(t: Ticket): { label: string; variant: "danger" | "warn" | "success" | "neutral" } | null {
  if (isClosed(t)) return { label: "Closed", variant: "neutral" };
  const due = parseDate(t?.sla_due_at || t?.slaDueAt || t?.sla_due || t?.slaDue);
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
  if (diff < 60 * 60 * 1000) return { label: `Due ${fmt()}`, variant: "warn" };
  return { label: `Due ${fmt()}`, variant: "success" };
}

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await listTickets({ includeClosed: true });
      if (!res?.ok) throw new Error(res?.error || "Failed to load tickets");
      setTickets(res?.tickets || res?.data?.tickets || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const { openTickets, closedTickets } = useMemo(() => {
    const open: Ticket[] = [];
    const closed: Ticket[] = [];
    for (const t of tickets) (isClosed(t) ? closed : open).push(t);
    const sortFn = (a: any, b: any) => {
      const ta = parseDate(a?.created_at || a?.createdAt);
      const tb = parseDate(b?.created_at || b?.createdAt);
      return tb - ta;
    };
    open.sort(sortFn);
    closed.sort(sortFn);
    return { openTickets: open, closedTickets: closed };
  }, [tickets]);

  return (
    <div className="page">
      <h1 className="pageTitle">Tickets</h1>
      <div className="pageSubtitle">Track urgent issues with SLA status and history.</div>

      <div style={{ marginTop: 12 }}>
        <Link className="btn primary" to="/tickets/new">Create ticket</Link>
      </div>

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="sectionHead">
            <h2 className="sectionTitle">Open</h2>
            <span className="countPill">{openTickets.length} active</span>
          </div>

          {openTickets.length === 0 ? (
            <div className="muted">No open tickets.</div>
          ) : (
            <div className="cards">
              {openTickets.map((t) => {
                const due = dueInfo(t);
                const created = fmtDateTime(t?.created_at || t?.createdAt);
                const createdBy = t?.created_by_name || t?.createdByName || t?.employee_name || t?.employeeName || "";
                const tag = (t?.tag || "").toString();
                return (
                  <Link key={t.id} className="itemCard" to={`/tickets/${t.id}`}>
                    <div className="itemTop">
                      <div className="itemTitle">{t.title || "Untitled ticket"}</div>
                      {tag ? <span className="pill neutral">{tag}</span> : null}
                    </div>

                    <div className="itemSub">
                      {t.location ? <span>{t.location}</span> : <span className="muted">No location</span>}
                      {created ? <span className="dot">•</span> : null}
                      {created ? <span>Created {created}</span> : null}
                    </div>

                    <div className="chipRow">
                      {due ? <span className={`dueChip ${due.variant}`}>{due.label}</span> : null}
                      {createdBy ? <span className="pill neutral">{createdBy}</span> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="sectionHead" style={{ marginTop: 18 }}>
            <h2 className="sectionTitle">Closed / Past</h2>
            <span className="countPill">{closedTickets.length}</span>
          </div>

          {closedTickets.length === 0 ? (
            <div className="muted">No closed tickets.</div>
          ) : (
            <div className="cards">
              {closedTickets.map((t) => {
                const due = dueInfo(t);
                const created = fmtDateTime(t?.created_at || t?.createdAt);
                const createdBy = t?.created_by_name || t?.createdByName || t?.employee_name || t?.employeeName || "";
                const tag = (t?.tag || "").toString();
                return (
                  <Link key={t.id} className="itemCard" to={`/tickets/${t.id}`}>
                    <div className="itemTop">
                      <div className="itemTitle">{t.title || "Untitled ticket"}</div>
                      {tag ? <span className="pill neutral">{tag}</span> : null}
                    </div>

                    <div className="itemSub">
                      {t.location ? <span>{t.location}</span> : <span className="muted">No location</span>}
                      {created ? <span className="dot">•</span> : null}
                      {created ? <span>Created {created}</span> : null}
                    </div>

                    <div className="chipRow">
                      {due ? <span className={`dueChip ${due.variant}`}>{due.label}</span> : <span className="pill neutral">Closed</span>}
                      {createdBy ? <span className="pill neutral">{createdBy}</span> : null}
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
