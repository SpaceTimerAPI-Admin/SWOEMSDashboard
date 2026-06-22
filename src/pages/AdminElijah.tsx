import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getElijahHistory, adminListUsers } from "../lib/api";

const TZ = "America/New_York";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminElijah() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [employees, setEmployees] = useState<any[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "normal" | "afterdark">("all");

  // Expanded conversation
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(p = page) {
    setLoading(true);
    try {
      const after_dark = filterMode === "afterdark" ? true : filterMode === "normal" ? false : null;
      const res: any = await getElijahHistory({
        page: p,
        employee_id: filterEmployee || undefined,
        after_dark: after_dark ?? undefined,
        search: search || undefined,
      });
      if (res?.ok) {
        const data = res.data ?? res;
        setConversations(data.conversations || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    adminListUsers().then((res: any) => {
      if (res?.ok) setEmployees((res.data ?? res).employees || []);
    });
  }, []);

  useEffect(() => { void load(1); setPage(1); }, [search, filterEmployee, filterMode]);
  useEffect(() => { void load(page); }, [page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  return (
    <div className="page fade-up" style={{ paddingBottom: 60 }}>
      {/* Header */}
      <Link to="/admin" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>← Admin</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", border: "2px solid rgba(92,107,255,0.4)", flexShrink: 0 }}>
          <img src="/assets/elijah-avatar.png" alt="Elijah" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
        </div>
        <div>
          <div className="page-title" style={{ marginBottom: 0 }}>Elijah Chat History</div>
          <div className="page-subtitle">{total} total conversation{total !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: "12px 14px", marginBottom: 14 }}>
        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 13, padding: "8px 12px" }}
            placeholder="Search questions & answers…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button className="btn primary" type="submit" style={{ fontSize: 13, padding: "8px 14px", flexShrink: 0 }}>
            Search
          </button>
          {search && (
            <button className="btn" type="button" style={{ fontSize: 13 }} onClick={() => { setSearch(""); setSearchInput(""); }}>
              Clear
            </button>
          )}
        </form>

        {/* Filter row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Employee filter */}
          <select
            className="input"
            style={{ fontSize: 12, padding: "6px 10px", flex: "1 1 160px" }}
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
          >
            <option value="">All Users</option>
            {employees.filter(e => e.role !== "show_tech").map((e: any) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          {/* Mode filter */}
          {(["all", "normal", "afterdark"] as const).map(mode => (
            <button key={mode} onClick={() => setFilterMode(mode)} style={{
              padding: "6px 12px", borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: filterMode === mode
                ? mode === "afterdark" ? "rgba(168,85,247,0.5)" : "rgba(92,107,255,0.4)"
                : "var(--border)",
              background: filterMode === mode
                ? mode === "afterdark" ? "rgba(168,85,247,0.12)" : "rgba(92,107,255,0.12)"
                : "rgba(255,255,255,0.04)",
              color: filterMode === mode
                ? mode === "afterdark" ? "#c084fc" : "#B0B8FF"
                : "var(--muted)",
            }}>
              {mode === "all" ? "All" : mode === "afterdark" ? "🌙 After Dark" : "☀️ Normal"}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      {loading ? (
        <div className="card" style={{ padding: "28px", textAlign: "center" }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto" }} />
        </div>
      ) : conversations.length === 0 ? (
        <div className="card" style={{ padding: "28px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🤷</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>
            {search || filterEmployee || filterMode !== "all" ? "No conversations match those filters." : "No conversations logged yet."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conversations.map((c: any) => {
            const isExpanded = expanded === c.id;
            return (
              <div
                key={c.id}
                className="card"
                style={{
                  padding: "0",
                  overflow: "hidden",
                  border: c.after_dark ? "1px solid rgba(168,85,247,0.2)" : undefined,
                }}
              >
                {/* Summary row — always visible */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : c.id)}
                  style={{ padding: "12px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                      {/* Avatar initial */}
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(92,107,255,0.2)", color: "#B0B8FF",
                        fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {c.employee_name?.charAt(0) || "?"}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{c.employee_name}</span>
                      {c.after_dark && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                          background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)",
                        }}>🌙 After Dark</span>
                      )}
                      {!c.context_found && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                          background: "rgba(255,182,39,0.12)", color: "#FFD07A", border: "1px solid rgba(255,182,39,0.25)",
                        }}>No Context</span>
                      )}
                      <span style={{ fontSize: 11, color: "var(--muted2)", marginLeft: "auto" }} title={fmtDateTime(c.created_at)}>
                        {fmtRelative(c.created_at)}
                      </span>
                    </div>
                    {/* Question preview */}
                    <div style={{
                      fontSize: 13, color: "var(--text)", fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isExpanded ? "normal" : "nowrap",
                    }}>
                      {c.question}
                    </div>
                    {!isExpanded && (
                      <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.answer}
                      </div>
                    )}
                  </div>
                  <span style={{ color: "var(--muted2)", fontSize: 14, flexShrink: 0, marginTop: 2 }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted2)", marginBottom: 6 }}>
                      Asked at {fmtDateTime(c.created_at)}
                    </div>

                    {/* Q */}
                    <div style={{
                      padding: "10px 14px", borderRadius: 10, background: "#4338ca",
                      color: "#fff", fontSize: 14, lineHeight: 1.5, marginBottom: 10,
                    }}>
                      {c.question}
                    </div>

                    {/* A */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                        <img src="/assets/elijah-avatar.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
                      </div>
                      <div style={{
                        flex: 1, padding: "10px 14px", borderRadius: "4px 14px 14px 14px",
                        background: "#161827", border: "1px solid #2d3147",
                        color: "#e5e7eb", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                      }}>
                        {c.answer
                          .replace(/\[TICKET #[a-zA-Z0-9-]+\]/g, "")
                          .replace(/\[PROJECT #[a-zA-Z0-9-]+\]/g, "")
                          .trim()}
                      </div>
                    </div>

                    {/* Cited items */}
                    {((c.cited_ticket_ids?.length > 0) || (c.cited_project_ids?.length > 0)) && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(c.cited_ticket_ids || []).map((id: string) => (
                          <Link key={id} to={`/tickets/${id}`}
                            style={{
                              fontSize: 11, padding: "3px 10px", borderRadius: 99,
                              background: "rgba(92,107,255,0.1)", color: "#c7d2fe",
                              border: "1px solid rgba(92,107,255,0.25)", textDecoration: "none",
                            }}>
                            🎫 Ticket
                          </Link>
                        ))}
                        {(c.cited_project_ids || []).map((id: string) => (
                          <Link key={id} to={`/projects/${id}`}
                            style={{
                              fontSize: 11, padding: "3px 10px", borderRadius: 99,
                              background: "rgba(255,182,39,0.1)", color: "#FFD07A",
                              border: "1px solid rgba(255,182,39,0.25)", textDecoration: "none",
                            }}>
                            📐 Project
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ fontSize: 13 }}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "var(--muted)", padding: "7px 12px" }}>
            Page {page} of {pages}
          </span>
          <button className="btn" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ fontSize: 13 }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
