import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";

type Ticket = any;

function isClosed(t: Ticket): boolean {
  const s = (t?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!t?.closed_at || !!t?.closedAt;
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

function slaLabel(t: any): { cls: string; text: string } {
  const status = (t?.status || "").toString().toLowerCase();
  if (status === "closed") return { cls: "neutral", text: "Closed" };
  if (status === "project") return { cls: "neutral", text: "Converted" };

  const msLeft = typeof t?.ms_left === "number" ? t.ms_left : (t?.sla_due_at ? Date.parse(t.sla_due_at) - Date.now() : NaN);
  if (!isFinite(msLeft)) return { cls: "neutral", text: "No SLA" };

  if (msLeft < 0) return { cls: "bad", text: `Overdue ${humanMs(msLeft)} ` };
  if (msLeft <= 15 * 60 * 1000) return { cls: "warn", text: `Due ${humanMs(msLeft)}` };
  return { cls: "good", text: `Due ${humanMs(msLeft)}` };
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
      setTickets(res?.data?.tickets || res?.tickets || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const { openTickets, closedTickets } = useMemo(() => {
    const open: Ticket[] = [];
    const closed: Ticket[] = [];
    for (const t of tickets) (isClosed(t) ? closed : open).push(t);

    const sortFn = (a: any, b: any) => {
      // prioritize overdue/due soon
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

    return { openTickets: open, closedTickets: closed };
  }, [tickets]);

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Tickets</h1>
          <div className="muted">Track urgent issues with SLA status and history.</div>
        </div>
        <Link className="btn inline" to="/tickets/new">Create ticket</Link>
      </div>

      {loading && <div className="muted" style={{ marginTop: 14 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="section-title">
            <h2 style={{ marginBottom: 0 }}>Open</h2>
            <span className="badge neutral">{openTickets.length} active</span>
          </div>

          {openTickets.length === 0 ? (
            <div className="muted">No open tickets.</div>
          ) : (
            <div className="list">
              {openTickets.map((t) => {
                const sla = slaLabel(t);
                return (
                  <Link key={t.id} className="list-item" to={`/tickets/${t.id}`}>
                    <div className="item-top">
                      <div className="grow">
                        <div className="title">{t.title || "Untitled ticket"}</div>
                        <div className="meta">{t.location || "No location"} • Created {fmtDate(t.created_at)}</div>
                      </div>
                      <div className="badges">
                        <span className={"badge " + sla.cls}>{sla.text}</span>
                        <span className="badge">{(t.created_by_name || t.created_by || "—")}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="section-title" style={{ marginTop: 18 }}>
            <h2 style={{ marginBottom: 0 }}>Closed / Past</h2>
            <span className="badge neutral">{closedTickets.length}</span>
          </div>

          {closedTickets.length === 0 ? (
            <div className="muted">No closed tickets.</div>
          ) : (
            <div className="list">
              {closedTickets.map((t) => (
                <Link key={t.id} className="list-item" to={`/tickets/${t.id}`}>
                  <div className="item-top">
                    <div className="grow">
                      <div className="title">{t.title || "Untitled ticket"}</div>
                      <div className="meta">{t.location || "No location"} • Created {fmtDate(t.created_at)}</div>
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
