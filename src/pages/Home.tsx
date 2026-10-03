import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets, listProjects, getTodaySchedule, getTodayBeo, getDocsUrl } from "../lib/api";
import { getProfile, getRole } from "../lib/auth";

const DISMISSED_KEY = "swoems_dismissed_ticket_reminders";

type TileProps = {
  to: string;
  icon: string;
  title: string;
  desc: string;
  accent?: string;
};

function Tile({ to, icon, title, desc, accent = "rgba(92,107,255,0.15)" }: TileProps) {
  return (
    <Link to={to} className="home-tile">
      <div className="tile-icon" style={{ background: accent }}>{icon}</div>
      <div className="tile-title">{title}</div>
      <div className="tile-desc">{desc}</div>
    </Link>
  );
}

function parseDate(v: any): number {
  const ms = Date.parse(v || "");
  return Number.isFinite(ms) ? ms : 0;
}

function isClosed(t: any): boolean {
  const s = (t?.status || "").toLowerCase();
  return s === "closed" || s === "done" || !!t?.closed_at;
}

function DocsButton() {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const res: any = await getDocsUrl();
      const url = res?.ok ? (res?.data?.url || res?.url) : null;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else alert("Documents link not configured yet.");
    } catch { alert("Could not load documents link."); }
    finally { setBusy(false); }
  }
  return (
    <button onClick={open} disabled={busy} className="home-tile" style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}>
      <div className="tile-icon" style={{ background: "rgba(56,189,248,0.15)" }}>{busy ? <span className="spinner" style={{ width: 18, height: 18 }} /> : "📁"}</div>
      <div className="tile-title">Documents</div>
      <div className="tile-desc">Team files & resources</div>
    </button>
  );
}

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function dismissTicket(id: string) {
  try {
    const dismissed = getDismissedIds();
    dismissed.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
  } catch {}
}

export default function Home() {
  const profile = getProfile();
  const [assigned, setAssigned] = useState<any[]>([]);

  // Ticket reminder popup
  const [reminderTickets, setReminderTickets] = useState<any[]>([]);

  // Schedule state
  const [scheduleEntries, setScheduleEntries] = useState<any[] | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>("");

  // Today's BEO events
  const [todayEvents, setTodayEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    async function loadAll() {
      try {
        const [tr, pr, sr, br] = await Promise.all([
          listTickets({ includeClosed: false }) as any,
          listProjects({ includeClosed: false }) as any,
          getTodaySchedule() as any,
          getTodayBeo() as any,
        ]);

        // Assigned tickets/projects
        const allTickets: any[] = tr?.ok ? tr?.data?.tickets || tr?.tickets || [] : [];
        const tickets = allTickets.filter((t: any) => t.assigned_to === profile!.id && !isClosed(t));
        const projects = (pr?.ok ? pr?.data?.projects || pr?.projects || [] : [])
          .filter((p: any) => p.assigned_to === profile!.id && !isClosed(p));
        const all = [
          ...tickets.map((t: any) => ({ ...t, _type: "ticket" })),
          ...projects.map((p: any) => ({ ...p, _type: "project" })),
        ].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
        setAssigned(all);

        // Ticket reminder: user's own open tickets from last 48 hours
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const myRecentOpen = allTickets.filter((t: any) =>
          (t.created_by === profile!.id || t.reporter_id === profile!.id) &&
          !isClosed(t) &&
          t.created_at >= cutoff
        );
        const currentDismissed = getDismissedIds();
        const newReminders = myRecentOpen.filter((t: any) => !currentDismissed.has(String(t.id)));
        if (newReminders.length > 0) {
          setReminderTickets(newReminders);
        }

        // Today's schedule
        if (sr?.ok) {
          const data = sr.data ?? sr;
          setScheduleEntries(data.entries || []);
          setScheduleDate(data.date || "");
        } else {
          setScheduleEntries([]);
        }

        // Today's events
        if (br?.ok) {
          setTodayEvents((br.data ?? br).events || []);
        }
      } catch {
        setScheduleEntries([]);
      }
    }
    void loadAll();
  }, [profile?.id]);

  function handleDismissTicket(id: string) {
    dismissTicket(id);
    setReminderTickets(prev => prev.filter(t => String(t.id) !== id));
  }

  const todayDisplay = scheduleDate
    ? new Date(scheduleDate + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="page fade-up">

      {/* Ticket Reminder Popup */}
      {reminderTickets.length > 0 && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 16px",
        }}>
          <div style={{
            width: "100%", maxWidth: 420,
            background: "var(--surface, #1a1a2e)",
            borderRadius: 16,
            border: "1px solid rgba(255,182,39,0.3)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, rgba(255,182,39,0.2) 0%, rgba(255,84,84,0.15) 100%)",
              padding: "18px 20px 14px",
              borderBottom: "1px solid rgba(255,182,39,0.2)",
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>⏰</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                Did you forget to close these?
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,210,120,0.8)", lineHeight: 1.4 }}>
                You have {reminderTickets.length} open ticket{reminderTickets.length > 1 ? "s" : ""} from your last 48 hours.
                Dismiss each one once you've confirmed its status.
              </div>
            </div>

            {/* Ticket list */}
            <div style={{ padding: "12px 16px", maxHeight: 320, overflowY: "auto" }}>
              {reminderTickets.map((t: any) => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>
                      {t.title || t.description || "Untitled ticket"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted2)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {t.location && <span>📍 {t.location}</span>}
                      {t.tag && <span>{t.tag}</span>}
                      <span style={{
                        color: "#fcd34d", background: "rgba(252,211,77,0.12)",
                        padding: "0 6px", borderRadius: 99, fontWeight: 600,
                      }}>
                        {t.status || "open"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Link
                      to={`/tickets/${t.id}`}
                      style={{
                        fontSize: 11, padding: "5px 10px", borderRadius: 8,
                        background: "rgba(92,107,255,0.15)", color: "#B0B8FF",
                        border: "1px solid rgba(92,107,255,0.3)",
                        textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap",
                      }}
                    >
                      View
                    </Link>
                    <button
                      onClick={() => handleDismissTicket(String(t.id))}
                      style={{
                        fontSize: 11, padding: "5px 10px", borderRadius: 8,
                        background: "rgba(46,232,160,0.1)", color: "#7EEFC4",
                        border: "1px solid rgba(46,232,160,0.25)",
                        cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                      }}
                    >
                      Got it ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 16px",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              display: "flex", justifyContent: "flex-end",
            }}>
              <button
                onClick={() => {
                  reminderTickets.forEach(t => handleDismissTicket(String(t.id)));
                }}
                style={{
                  fontSize: 12, padding: "8px 16px", borderRadius: 8,
                  background: "rgba(255,255,255,0.07)", color: "var(--muted)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer", fontWeight: 600,
                }}
              >
                Dismiss all
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 4 }}>
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">SeaWorld Entertainment Maintenance</div>
      </div>

      {/* Today's Events Alert */}
      {todayEvents.length > 0 && (
        <Link to="/events" style={{ textDecoration: "none", display: "block", marginBottom: 16 }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(255,182,39,0.18) 0%, rgba(255,84,84,0.15) 100%)",
            border: "1px solid rgba(255,182,39,0.35)",
            borderRadius: 12, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>🎪</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#FFD07A", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Event{todayEvents.length > 1 ? "s" : ""} Today — Action Required
              </span>
            </div>
            {todayEvents.map((ev: any) => {
              const setup = ev.beo_actions?.find((a: any) => a.action_type === "setup");
              const strike = ev.beo_actions?.find((a: any) => a.action_type === "strike");
              return (
                <div key={ev.id} style={{
                  background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 6,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                    {ev.event_name}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 99, fontWeight: 600,
                      background: setup ? "rgba(46,232,160,0.15)" : "rgba(255,182,39,0.2)",
                      color: setup ? "#7EEFC4" : "#FFD07A",
                    }}>
                      {setup ? "✓ Setup done" : "⏳ Setup needed"}
                    </span>
                    <span style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 99, fontWeight: 600,
                      background: strike ? "rgba(46,232,160,0.15)" : "rgba(255,255,255,0.07)",
                      color: strike ? "#7EEFC4" : "var(--muted2)",
                    }}>
                      {strike ? "✓ Strike done" : "Strike pending"}
                    </span>
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: "rgba(255,210,120,0.7)", marginTop: 2 }}>Tap to manage →</div>
          </div>
        </Link>
      )}

      {/* Today's Shift — bottom */}
      <div className="card" style={{ padding: "14px 16px", marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)" }}>
            👥 On Shift Today
          </div>
          <div style={{ fontSize: 11, color: "var(--muted2)" }}>{todayDisplay}</div>
        </div>

        {scheduleEntries === null ? (
          <div style={{ fontSize: 13, color: "var(--muted2)" }}>Loading…</div>
        ) : scheduleEntries.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted2)", fontStyle: "italic" }}>
            No schedule for today.{" "}
            <Link to="/settings" style={{ color: "var(--muted)", textDecoration: "underline" }}>
              Upload one in Settings.
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {scheduleEntries.map((entry: any, i: number) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, padding: "8px 10px", borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {entry.employee_name}
                </div>
                {entry.shift_start && entry.shift_end ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {entry.all_shifts || `${entry.shift_start} – ${entry.shift_end}`}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted2)" }}>—</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {assigned.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 8,
          }}>
            📌 Assigned to you ({assigned.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {assigned.map(item => (
              <Link
                key={item.id}
                to={item._type === "ticket" ? `/tickets/${item.id}` : `/projects/${item.id}`}
                className="card"
                style={{
                  padding: "11px 14px", display: "block", textDecoration: "none",
                  borderLeft: "3px solid rgba(92,107,255,0.5)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                      {item._type === "project" ? "📐 Project" : "🎫 Ticket"}
                      {item.location ? ` · 📍 ${item.location}` : ""}
                      {item.tag ? ` · ${item.tag}` : ""}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                    background: "rgba(46,232,160,0.1)", color: "#7EEFC4",
                    border: "1px solid rgba(46,232,160,0.2)", whiteSpace: "nowrap",
                  }}>Open</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="home-grid">
        <Tile to="/tickets/new"  icon="🎫" title="Log a Work Order" desc="Create a new work order ticket"     accent="rgba(92,107,255,0.18)" />
        <Tile to="/tickets"      icon="📋" title="Tickets"      desc="View & manage all tickets"          accent="rgba(46,232,160,0.12)" />
        <Tile to="/projects"     icon="📐" title="Projects"     desc="Track longer-term work items"       accent="rgba(255,182,39,0.12)" />
        <Tile to="/events"       icon="🎪" title="Events"       desc="BEO calendar & setup tracking"      accent="rgba(255,84,84,0.13)" />
        <Tile to="/shift-log"    icon="📓" title="Shift Log"    desc="Log notes throughout your shift"    accent="rgba(168,144,255,0.15)" />
        <Tile to="/eod"          icon="📝" title="EOD Report"   desc="Generate & email today's recap"     accent="rgba(255,84,84,0.12)" />
        <Tile to="/procedures"   icon="📖" title="Procedures"   desc="Step-by-step guides & references"   accent="rgba(56,189,248,0.12)" />
        <Tile to="/inventory"    icon="🗂️" title="Inventory"    desc="Track equipment & gear status"       accent="rgba(46,232,160,0.12)" />
        <DocsButton />
        {getRole() === "admin" && (
          <Tile to="/admin" icon="🛡️" title="Admin" desc="User management & settings" accent="rgba(255,182,39,0.15)" />
        )}
      </div>
    </div>
  );
}
