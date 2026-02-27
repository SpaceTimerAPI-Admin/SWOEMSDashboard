import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";

type Ticket = any;

function isClosed(t: Ticket): boolean {
  const s = (t?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!t?.closed_at || !!t?.closedAt;
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

function slaPill(t: any): { text: string; tone: "ok" | "warn" | "bad" | "closed" } {
  const status = (t?.status || "").toString().toLowerCase();
  if (status === "closed" || status === "done" || t?.closed_at || t?.closedAt) {
    return { text: "Closed", tone: "closed" };
  }

  const dueIso = t?.sla_due_at || t?.slaDueAt || t?.due_at || t?.dueAt;
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
      const ta = Date.parse(a?.created_at || a?.createdAt || "") || 0;
      const tb = Date.parse(b?.created_at || b?.createdAt || "") || 0;
      return tb - ta;
    };

    open.sort(sortFn);
    closed.sort(sortFn);
    return { openTickets: open, closedTickets: closed };
  }, [tickets]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tickets</h1>
          <div className="muted">Track urgent issues with SLA status and history.</div>
        </div>
        <Link className="btn inline primary" to="/tickets/new">
          Create ticket
        </Link>
      </div>

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-head">
            <h2>Open</h2>
            <span className="pill">{openTickets.length} active</span>
          </div>

          {openTickets.length === 0 ? (
            <div className="muted">No open tickets.</div>
          ) : (
            <div className="cards">
              {openTickets.map((t) => {
                const sla = slaPill(t);
                const created = fmtWhen(t?.created_at || t?.createdAt);
                const who = t?.created_by_name || t?.createdByName || t?.employee_name || t?.employeeName;
                const tag = t?.tag;
                return (
                  <Link key={t.id} className="cardlink" to={`/tickets/${t.id}`}>
                    <div className="carditem">
                      <div className="cardtop">
                        <div className="cardtitle">{t.title || "(Untitled)"}</div>
                        <div className="pillrow">
                          {tag && <span className="pill tone">{tag}</span>}
                          <span className={`pill sla ${sla.tone}`}>{sla.text}</span>
                        </div>
                      </div>
                      <div className="cardsub">
                        {t.location ? <span>{t.location}</span> : <span className="muted">No location</span>}
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

          <div className="section-head" style={{ marginTop: 22 }}>
            <h2>Closed / Past</h2>
            <span className="pill">{closedTickets.length}</span>
          </div>

          {closedTickets.length === 0 ? (
            <div className="muted">No closed tickets.</div>
          ) : (
            <div className="cards">
              {closedTickets.map((t) => {
                const sla = slaPill({ ...t, status: "closed" });
                const created = fmtWhen(t?.created_at || t?.createdAt);
                const who = t?.created_by_name || t?.createdByName || t?.employee_name || t?.employeeName;
                const tag = t?.tag;
                return (
                  <Link key={t.id} className="cardlink" to={`/tickets/${t.id}`}>
                    <div className="carditem">
                      <div className="cardtop">
                        <div className="cardtitle">{t.title || "(Untitled)"}</div>
                        <div className="pillrow">
                          {tag && <span className="pill tone">{tag}</span>}
                          <span className={`pill sla ${sla.tone}`}>{sla.text}</span>
                        </div>
                      </div>
                      <div className="cardsub">
                        {t.location ? <span>{t.location}</span> : <span className="muted">No location</span>}
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
