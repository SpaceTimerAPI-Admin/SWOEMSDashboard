import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";

type Ticket = any;

function isClosed(t: Ticket): boolean {
  const s = (t?.status || "").toString().toLowerCase();
  return s === "closed" || s === "done" || !!t?.closed_at || !!t?.closedAt;
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

  useEffect(() => { void load(); }, []);

  const { openTickets, closedTickets } = useMemo(() => {
    const open: Ticket[] = [];
    const closed: Ticket[] = [];
    for (const t of tickets) (isClosed(t) ? closed : open).push(t);
    // newest first if created_at exists
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
      <div className="row between">
        <h1>Tickets</h1>
        <Link className="btn primary" to="/tickets/new">Create ticket</Link>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <>
          <h2>Open</h2>
          {openTickets.length === 0 ? (
            <div className="muted">No open tickets.</div>
          ) : (
            <div className="list">
              {openTickets.map((t) => (
                <Link key={t.id} className="list-item" to={`/tickets/${t.id}`}>
                  <div className="title">{t.title}</div>
                  <div className="meta">{t.location}</div>
                </Link>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 24 }}>Closed / Past</h2>
          {closedTickets.length === 0 ? (
            <div className="muted">No closed tickets.</div>
          ) : (
            <div className="list">
              {closedTickets.map((t) => (
                <Link key={t.id} className="list-item" to={`/tickets/${t.id}`}>
                  <div className="title">{t.title}</div>
                  <div className="meta">{t.location}</div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
