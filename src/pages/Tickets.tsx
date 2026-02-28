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

function dueInfo(t: Ticket): {
  label: string;
  variant: "danger" | "warn" | "success" | "neutral";
} | null {
  if (isClosed(t)) return { label: "Closed", variant: "neutral" };
  const due = parseDate(
    t?.sla_due_at || t?.slaDueAt || t?.sla_due || t?.slaDue,
  );
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

  const { openAll, closedAll } = useMemo(() => {
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
    return { openAll: open, closedAll: closed };
  }, [tickets]);

  const perPage = 10;

  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);

  // reset pages when data changes
  useEffect(() => {
    setOpenPage(1);
    setClosedPage(1);
  }, [tickets.length]);

  const openTotalPages = Math.max(1, Math.ceil(openAll.length / perPage));
  const closedTotalPages = Math.max(1, Math.ceil(closedAll.length / perPage));

  const openTickets = openAll.slice(
    (openPage - 1) * perPage,
    openPage * perPage,
  );
  const closedTickets = closedAll.slice(
    (closedPage - 1) * perPage,
    closedPage * perPage,
  );

  const renderPagination = (
    total: number,
    page: number,
    setPage: (n: number) => void,
  ) => {
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
      <h1 className="page-title">Tickets</h1>
      <div className="page-subtitle">
        Track urgent issues with SLA status and history.
      </div>

      <div style={{ marginTop: 12 }}>
        <Link className="btn primary" to="/tickets/new">
          Create ticket
        </Link>
      </div>

      {loading && (
        <div className="muted" style={{ marginTop: 12 }}>
          Loading…
        </div>
      )}
      {error && (
        <div className="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="section-head">
            <h2 className="section-title">Open</h2>
            <span className="count-pill">{openAll.length} active</span>
          </div>

          {openTickets.length === 0 ? (
            <div className="muted">No open tickets.</div>
          ) : (
            <div className="cards">
              {openTickets.map((t) => {
                const due = dueInfo(t);
                const created = fmtDateTime(t?.created_at || t?.createdAt);
                const createdBy =
                  t?.created_by_name ||
                  t?.createdByName ||
                  t?.employee_name ||
                  t?.employeeName ||
                  "";
                const tag = (t?.tag || "").toString();
                return (
                  <Link
                    key={t.id}
                    className="item-card"
                    to={`/tickets/${t.id}`}
                  >
                    <div className="item-top">
                      <div className="item-title">
                        {t.title || "Untitled ticket"}
                      </div>
                      {tag ? <span className="chip neutral">{tag}</span> : null}
                    </div>

                    <div className="item-sub">
                      {t.location ? (
                        <span>{t.location}</span>
                      ) : (
                        <span className="muted">No location</span>
                      )}
                      {created ? <span className="dot">•</span> : null}
                      {created ? <span>Created {created}</span> : null}
                    </div>

                    <div className="chip-row">
                      {due ? (
                        <span className={`chip ${due.variant}`}>
                          {due.label}
                        </span>
                      ) : null}
                      {createdBy ? (
                        <span className="chip neutral">{createdBy}</span>
                      ) : null}
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

          {closedTickets.length === 0 ? (
            <div className="muted">No closed tickets.</div>
          ) : (
            <div className="cards">
              {closedTickets.map((t) => {
                const due = dueInfo(t);
                const created = fmtDateTime(t?.created_at || t?.createdAt);
                const createdBy =
                  t?.created_by_name ||
                  t?.createdByName ||
                  t?.employee_name ||
                  t?.employeeName ||
                  "";
                const tag = (t?.tag || "").toString();
                return (
                  <Link
                    key={t.id}
                    className="item-card"
                    to={`/tickets/${t.id}`}
                  >
                    <div className="item-top">
                      <div className="item-title">
                        {t.title || "Untitled ticket"}
                      </div>
                      {tag ? <span className="chip neutral">{tag}</span> : null}
                    </div>

                    <div className="item-sub">
                      {t.location ? (
                        <span>{t.location}</span>
                      ) : (
                        <span className="muted">No location</span>
                      )}
                      {created ? <span className="dot">•</span> : null}
                      {created ? <span>Created {created}</span> : null}
                    </div>

                    <div className="chip-row">
                      {due ? (
                        <span className={`chip ${due.variant}`}>
                          {due.label}
                        </span>
                      ) : (
                        <span className="chip neutral">Closed</span>
                      )}
                      {createdBy ? (
                        <span className="chip neutral">{createdBy}</span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {renderPagination(closedTotalPages, closedPage, setClosedPage)}
        </>
      )}
    </div>
  );
}
