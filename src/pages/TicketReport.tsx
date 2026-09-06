import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getRole } from "../lib/auth";

async function fetchTickets(search: string, since: string) {
  const token = localStorage.getItem("md_session_token");
  const res = await fetch(`/api/ticket-report?search=${encodeURIComponent(search)}&since=${since}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAnalysis(tickets: any[], search: string, since: string) {
  const token = localStorage.getItem("md_session_token");
  const res = await fetch(`/api/ticket-report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tickets, search, since }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    return new Date(ticket.closed_at) <= new Date(ticket.sla_due_at)
      ? { label: "Closed on time", color: "#34d399" }
      : { label: "Closed overdue", color: "#f87171" };
  }
  if (!ticket.sla_due_at) return { label: "Open", color: "#fbbf24" };
  return new Date(ticket.sla_due_at) < new Date()
    ? { label: "Open — OVERDUE", color: "#f87171" }
    : { label: "Open", color: "#fbbf24" };
}

function daysOpen(ticket: any): string {
  const end = ticket.closed_at ? new Date(ticket.closed_at) : new Date();
  const days = Math.round((end.getTime() - new Date(ticket.created_at).getTime()) / 86400000);
  return days === 1 ? "1 day" : `${days} days`;
}

const TAG_COLORS: Record<string, string> = {
  Lighting: "#818cf8", Sound: "#34d399", Video: "#f59e0b", Rides: "#f87171", Misc: "#9ca3af",
};

// Render AI analysis text with section headers highlighted
function AnalysisSection({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {lines.map((line, i) => {
        const isHeader = /^\d+\.\s+[A-Z\s&]+$/.test(line.trim()) || /^#{1,3}\s/.test(line);
        const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("• ");
        const cleaned = line.replace(/^#{1,3}\s/, "").replace(/\*\*/g, "");

        if (!cleaned.trim()) return <div key={i} style={{ height: 8 }} />;

        if (isHeader) {
          return (
            <div key={i} style={{
              fontSize: 13, fontWeight: 700, color: "#c7d2fe",
              textTransform: "uppercase", letterSpacing: "0.06em",
              marginTop: 16, marginBottom: 4,
              paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}>
              {cleaned}
            </div>
          );
        }

        if (isBullet) {
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingLeft: 4 }}>
              <span style={{ color: "#818cf8", flexShrink: 0, marginTop: 2 }}>▸</span>
              <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>
                {cleaned.replace(/^[-•]\s+/, "")}
              </span>
            </div>
          );
        }

        return (
          <p key={i} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>
            {cleaned}
          </p>
        );
      })}
    </div>
  );
}

export default function TicketReport() {
  const role = getRole();
  const [search, setSearch] = useState("odyssey");
  const [since, setSince] = useState("2026-05-25");
  const [tickets, setTickets] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

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
    setAnalysisLoading(true);
    setError(null);
    setAnalysis(null);
    setAnalysisError(null);
    setTickets([]);
    setHasLoaded(false);
    try {
      // Phase 1 — tickets load fast (no AI), show them immediately
      const ticketsRes = await fetchTickets(search.trim(), since);
      if (!ticketsRes.ok) throw new Error(ticketsRes.error || "Failed to load tickets");
      setTickets(ticketsRes.tickets || []);
      setHasLoaded(true);
      setLoading(false);

      // Phase 2 — POST ticket data to backend, backend only runs AI (no DB re-query)
      if ((ticketsRes.tickets || []).length > 0) {
        try {
          const analysisRes = await fetchAnalysis(ticketsRes.tickets, search.trim(), since);
          if (analysisRes.analysis) {
            setAnalysis(analysisRes.analysis);
          } else {
            const errMsg = analysisRes.analysis_error || "AI analysis returned empty";
            setAnalysisError(`${errMsg} — try generating the report again.`);
          }
        } catch (e: any) {
          setAnalysisError(`AI analysis failed: ${e?.message || "unknown error"}`);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load report");
      setLoading(false);
    } finally {
      setAnalysisLoading(false);
    }
  }

  const closed = tickets.filter(t => t.status === "closed");
  const open = tickets.filter(t => t.status === "open");
  const overdue = tickets.filter(t => t.status === "open" && t.sla_due_at && new Date(t.sla_due_at) < new Date());
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
          .card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; }
          body { background: white !important; color: black !important; font-size: 12px !important; }
          .print-show { display: block !important; }
        }
        .print-show { display: none; }
      `}</style>

      {/* Print-only header */}
      <div className="print-show" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>SWOEMS Ticket Report — "{search}"</h1>
        <p style={{ fontSize: 12, margin: "4px 0 0" }}>
          Since {fmtDate(since + "T12:00:00")} · Generated {generatedOn} · SeaWorld Entertainment Maintenance
        </p>
      </div>

      {/* Controls */}
      <div className="no-print">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="page-title">Ticket Report</div>
            <div className="page-subtitle">Searches title, location & description</div>
          </div>
          {hasLoaded && tickets.length > 0 && (
            <button className="btn primary small" onClick={() => window.print()}>
              🖨️ Print / Save PDF
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label>
              <div className="field-label">Search keyword</div>
              <input className="input" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="e.g. odyssey" onKeyDown={e => e.key === "Enter" && load()} />
            </label>
            <label>
              <div className="field-label">Since date</div>
              <input className="input" type="date" value={since} onChange={e => setSince(e.target.value)} />
            </label>
          </div>
          <button className="btn primary" onClick={load} disabled={loading} style={{ width: "100%" }}>
            {loading
              ? <><span className="spinner" style={{ marginRight: 6 }} /> Generating report + AI analysis…</>
              : "Generate Report"}
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
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Total", value: tickets.length, color: "#818cf8" },
              { label: "Open", value: open.length, color: "#fbbf24" },
              { label: "Overdue", value: overdue.length, color: "#f87171" },
              { label: "Closed", value: closed.length, color: "#34d399" },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 20 }}>
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} matching "{search}" since {fmtDate(since + "T12:00:00")} · Generated {generatedOn}
          </div>

          {tickets.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No tickets found matching "{search}"</div>
            </div>
          ) : (
            <>
              {/* ── AI Analysis ─────────────────────────────────────── */}
              <div className="card" style={{ padding: "18px 20px", marginBottom: 20, borderLeft: "3px solid #818cf8" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>🤖</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>AI Pattern Analysis</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Generated by Claude · For management review</div>
                  </div>
                </div>
                {analysisLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13 }}>
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Analyzing patterns across {tickets.length} tickets…
                  </div>
                ) : analysis ? (
                  <AnalysisSection text={analysis} />
                ) : analysisError ? (
                  <div style={{ fontSize: 13, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    ⚠ {analysisError}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Analysis unavailable.</div>
                )}
              </div>

              {/* ── Ticket list ─────────────────────────────────────── */}
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                All Tickets ({tickets.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {tickets.map((t, i) => {
                  const sla = slaStatus(t);
                  const comments = [...(t.comments || [])].sort((a, b) =>
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  );
                  return (
                    <div key={t.id} className="card" style={{ padding: "14px 16px" }}>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: "var(--muted2)", fontWeight: 600 }}>#{i + 1}</span>
                            <Link to={`/tickets/${t.id}`} className="no-print" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", textDecoration: "none" }}>
                              {t.title}
                            </Link>
                            <span className="print-show" style={{ fontSize: 14, fontWeight: 700 }}>{t.title}</span>
                            {t.tag && (
                              <span style={{
                                fontSize: 10, padding: "1px 7px", borderRadius: 99, fontWeight: 600,
                                background: `${TAG_COLORS[t.tag] || "#9ca3af"}22`,
                                color: TAG_COLORS[t.tag] || "#9ca3af",
                                border: `1px solid ${TAG_COLORS[t.tag] || "#9ca3af"}44`,
                              }}>{t.tag}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            📍 {t.location || "—"}
                            {t.created_by_emp?.name && <> · By {t.created_by_emp.name}</>}
                            {t.assigned_emp?.name && <> · Assigned: {t.assigned_emp.name}</>}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99,
                          background: `${sla.color}18`, color: sla.color,
                          border: `1px solid ${sla.color}44`, flexShrink: 0,
                        }}>{sla.label}</span>
                      </div>

                      {/* Timeline row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                        {[
                          { label: "Opened", val: fmtDateTime(t.created_at) },
                          { label: t.status === "closed" ? "Closed" : "SLA Due", val: t.status === "closed" ? (t.closed_at ? fmtDateTime(t.closed_at) : "—") : (t.sla_due_at ? fmtDateTime(t.sla_due_at) : "—") },
                          { label: "Duration", val: daysOpen(t) },
                        ].map(item => (
                          <div key={item.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px" }}>
                            <div style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{item.label}</div>
                            <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}>{item.val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Details */}
                      {t.details && (
                        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, marginBottom: comments.length ? 8 : 0 }}>
                          {t.details}
                        </div>
                      )}

                      {/* Comments */}
                      {comments.length > 0 && (
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, fontWeight: 600 }}>
                            Updates ({comments.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {comments.map((c: any, ci: number) => (
                              <div key={ci} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <span style={{ color: "var(--muted2)", whiteSpace: "nowrap", flexShrink: 0, fontSize: 11 }}>
                                  {fmtDate(c.created_at)} · {c.commenter?.name || "Staff"}
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

              {/* Footer */}
              <div style={{ marginTop: 24, padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "var(--muted2)", textAlign: "center" }}>
                SWOEMS · SeaWorld Entertainment Maintenance System · {generatedOn}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
