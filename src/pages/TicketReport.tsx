import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getRole } from "../lib/auth";

const BASE = "/api/ticket-report";

async function fetchReport(search: string, since: string) {
  const token = localStorage.getItem("swoems_token");
  const res = await fetch(`${BASE}?search=${encodeURIComponent(search)}&since=${since}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function slaStatus(ticket: any): { label: string; color: string } {
  if (ticket.status === "closed") {
    if (!ticket.sla_due_at || !ticket.closed_at) return { label: "Closed", color: "#9ca3af" };
    const onTime = new Date(ticket.closed_at) <= new Date(ticket.sla_due_at);
    return onTime
      ? { label: "Closed on time", color: "#34d399" }
      : { label: "Closed overdue", color: "#f87171" };
  }
  if (!ticket.sla_due_at) return { label: "Open", color: "#fbbf24" };
  const overdue = new Date(ticket.sla_due_at) < new Date();
  return overdue
    ? { label: "Open — OVERDUE", color: "#f87171" }
    : { label: "Open", color: "#fbbf24" };
}

function daysOpen(ticket: any): string {
  const end = ticket.closed_at ? new Date(ticket.closed_at) : new Date();
  const start = new Date(ticket.created_at);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  return days === 1 ? "1 day" : `${days} days`;
}

const TAG_COLORS: Record<string, string> = {
  Lighting: "#818cf8", Sound: "#34d399", Video: "#f59e0b",
  Rides: "#f87171", Misc: "#9ca3af",
};

export default function TicketReport() {
  const role = getRole();
  const [search, setSearch] = useState("odyssey");
  const [since, setSince] = useState("2026-05-25");
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  if (role === "show_tech") {
    return (
      <div className="page fade-up">
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>Access restricted.</div>
        </div>
      </div>
    );
  }

  async function load() {
    if (!search.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReport(search.trim(), since);
      if (!res.ok) throw new Error(res.error || "Failed to load");
      setTickets(res.tickets || []);
      setHasLoaded(true);
    } catch (e: any) {
      setError(e?.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const closed = tickets.filter(t => t.status === "closed");
  const open = tickets.filter(t => t.status === "open");
  const overdue = tickets.filter(t => {
    if (t.status === "closed") return false;
    return t.sla_due_at && new Date(t.sla_due_at) < new Date();
  });

  const generatedOn = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York", month: "long", day: "numeric",
    year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <div className="page fade-up">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page { padding: 0 !important; }
          .card { box-shadow: none !important; border: 1px solid #ccc !important; break-inside: avoid; }
          body { background: white !important; color: black !important; }
          .print-header { display: block !important; }
        }
        .print-header { display: none; }
      `}</style>

      {/* Print header */}
      <div className="print-header" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>SWOEMS Ticket Report — "{search}"</h1>
        <p style={{ fontSize: 13, margin: "4px 0 0" }}>Since {fmtDate(since + "T12:00:00")} · Generated {generatedOn}</p>
      </div>

      {/* Controls */}
      <div className="no-print">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="page-title">Ticket Report</div>
            <div className="page-subtitle">Search across ticket titles, locations & details</div>
          </div>
          {hasLoaded && tickets.length > 0 && (
            <button className="btn primary small no-print" onClick={handlePrint}>
              🖨️ Print / Save PDF
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label>
              <div className="field-label">Search keyword</div>
              <input className="input" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="e.g. odyssey" />
            </label>
            <label>
              <div className="field-label">Since date</div>
              <input className="input" type="date" value={since} onChange={e => setSince(e.target.value)} />
            </label>
          </div>
          <button className="btn primary" onClick={load} disabled={loading} style={{ width: "100%" }}>
            {loading ? <><span className="spinner" /> Loading…</> : "Generate Report"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {hasLoaded && (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Total Tickets", value: tickets.length, color: "#818cf8" },
              { label: "Open", value: open.length, color: "#fbbf24" },
              { label: "Overdue", value: overdue.length, color: "#f87171" },
              { label: "Closed", value: closed.length, color: "#34d399" },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Report header for print */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
              Showing <strong style={{ color: "var(--text)" }}>{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</strong> matching
              "{search}" since {fmtDate(since + "T12:00:00")}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted2)" }}>Generated {generatedOn} · SeaWorld Entertainment Maintenance System</div>
          </div>

          {tickets.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No tickets found matching "{search}" since {fmtDate(since + "T12:00:00")}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }} ref={printRef}>
              {tickets.map((t, i) => {
                const sla = slaStatus(t);
                const comments = [...(t.comments || [])].sort((a, b) =>
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
                return (
                  <div key={t.id} className="card" style={{ padding: "16px 18px" }}>
                    {/* Ticket header */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted2)" }}>#{i + 1}</span>
                          <Link to={`/tickets/${t.id}`} className="no-print" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", textDecoration: "none" }}>
                            {t.title}
                          </Link>
                          <span className="print-header" style={{ fontSize: 15, fontWeight: 700 }}>{t.title}</span>
                          {t.tag && (
                            <span style={{
                              fontSize: 11, padding: "1px 8px", borderRadius: 99, fontWeight: 600,
                              background: `${TAG_COLORS[t.tag] || "#9ca3af"}22`,
                              color: TAG_COLORS[t.tag] || "#9ca3af",
                              border: `1px solid ${TAG_COLORS[t.tag] || "#9ca3af"}44`,
                            }}>{t.tag}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          📍 {t.location || "—"}
                          {t.created_by_emp?.name && <> · Submitted by {t.created_by_emp.name}</>}
                          {t.assigned_emp?.name && <> · Assigned to {t.assigned_emp.name}</>}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                        background: `${sla.color}18`, color: sla.color,
                        border: `1px solid ${sla.color}44`, flexShrink: 0,
                      }}>
                        {sla.label}
                      </div>
                    </div>

                    {/* Timeline */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Opened</div>
                        <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{fmtDateTime(t.created_at)}</div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
                          {t.status === "closed" ? "Closed" : "SLA Due"}
                        </div>
                        <div style={{ fontSize: 12, color: t.status === "open" && t.sla_due_at && new Date(t.sla_due_at) < new Date() ? "#f87171" : "var(--text)", fontWeight: 500 }}>
                          {t.status === "closed"
                            ? (t.closed_at ? fmtDateTime(t.closed_at) : "—")
                            : (t.sla_due_at ? fmtDateTime(t.sla_due_at) : "—")}
                        </div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Duration</div>
                        <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{daysOpen(t)}</div>
                      </div>
                    </div>

                    {/* Details */}
                    {t.details && (
                      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: comments.length ? 10 : 0, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                        {t.details}
                      </div>
                    )}

                    {/* Comments */}
                    {comments.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                          Updates ({comments.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {comments.map((c: any, ci: number) => (
                            <div key={ci} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <span style={{ color: "var(--muted2)", whiteSpace: "nowrap", flexShrink: 0, fontSize: 11 }}>
                                {fmtDate(c.created_at)} · {c.commenter?.name || "—"}
                              </span>
                              <span style={{ color: "var(--muted)", lineHeight: 1.5 }}>{c.comment}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          {tickets.length > 0 && (
            <div style={{ marginTop: 20, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "var(--muted2)", textAlign: "center" }}>
              SWOEMS · SeaWorld Entertainment Maintenance System · {generatedOn}
            </div>
          )}
        </>
      )}
    </div>
  );
}
