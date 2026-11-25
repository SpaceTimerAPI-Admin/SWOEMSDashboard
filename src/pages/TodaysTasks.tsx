import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getToken, getRole } from "../lib/auth";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  return res.json();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
  });
}

type Task = {
  ticket_id: number; location: string; description: string; reported_by: string;
  created_at: string; status: string; updated: boolean;
  last_update: { author: string; body: string; created_at: string } | null;
};
type TeamRow = {
  name: string; started_at: string; total: number; updated: number; is_me: boolean;
  opened?: number; closed?: number; // admins only
};

function shiftDay(day: string, by: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

export default function TodaysTasks() {
  const navigate = useNavigate();
  const isShowTech = getRole() === "show_tech";
  const isAdmin    = getRole() === "admin";
  const [day, setDay]         = useState<string | null>(null);   // admins: the day being viewed
  const [todayDay, setTodayDay] = useState<string | null>(null);

  const [state, setState]   = useState<"loading" | "ready" | "error">("loading");
  const [onShift, setOnShift] = useState(false);
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [team, setTeam]     = useState<TeamRow[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    if (!getToken()) { navigate("/login", { replace: true }); return; }
    void load();
  }, []);

  function apply(res: any) {
    setOnShift(!!res.on_shift);
    setTasks(res.tasks || []);
    setTeam(res.team || []);
    if (res.business_day) setDay(res.business_day);
    if (res.today) setTodayDay(res.today);
    setState("ready");
  }

  async function load(forDay?: string) {
    try {
      const res = await apiFetch(`/api/showtech-tasks${forDay ? `?day=${forDay}` : ""}`);
      if (!res.ok) { setError(res.error || ""); setState("error"); return; }
      apply(res);
    } catch { setState("error"); }
  }

  async function startShift() {
    setStarting(true);
    setError("");
    try {
      const res = await apiFetch("/api/showtech-shift-start", { method: "POST", body: "{}" });
      if (res.ok) apply(res);
      else setError(res.error || "Could not start your shift. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally { setStarting(false); }
  }

  const today = (isAdmin && day ? new Date(`${day}T12:00:00Z`) : new Date()).toLocaleDateString("en-US", {
    timeZone: isAdmin && day ? "UTC" : "America/New_York", weekday: "long", month: "long", day: "numeric",
  });
  const viewingToday = !day || !todayDay || day === todayDay;
  const sum = (k: "total" | "updated" | "opened" | "closed") => team.reduce((n, m) => n + (m[k] || 0), 0);
  const done = tasks.filter(t => t.updated).length;
  const allDone = tasks.length > 0 && done === tasks.length;

  return (
    <div className="page fade-up" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">{isShowTech ? "📋 Today's Tasks" : "📊 Show Tech Progress"}</div>
        <div className="page-subtitle">{today}</div>
      </div>

      {/* Admins can step back through earlier days */}
      {isAdmin && day && state !== "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <button className="btn" style={{ padding: "7px 12px", fontSize: 13 }}
            onClick={() => void load(shiftDay(day, -1))}>← Previous day</button>
          <div style={{ flex: 1 }} />
          {!viewingToday && (
            <>
              <button className="btn" style={{ padding: "7px 12px", fontSize: 13 }}
                onClick={() => void load(shiftDay(day, 1))}>Next day →</button>
              <button className="btn" style={{ padding: "7px 12px", fontSize: 13 }}
                onClick={() => void load()}>Today</button>
            </>
          )}
        </div>
      )}

      {state === "loading" && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      )}

      {state === "error" && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
            Could not load today's tasks.{error ? ` (${error})` : ""}
          </div>
          <button className="btn primary" onClick={() => { setState("loading"); void load(); }}>Retry</button>
        </div>
      )}

      {state === "ready" && (
        <>
          {/* The rule — always visible to show techs */}
          {isShowTech && <div style={{
            background: "rgba(255,182,39,0.08)", border: "1px solid rgba(255,182,39,0.3)",
            borderRadius: 12, padding: "13px 15px", marginBottom: 16,
            fontSize: 13, color: "var(--text)", lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: "#FFB627", marginBottom: 4 }}>⚠️ Required this shift</div>
            Every ticket below <strong>must be reviewed during today's shift</strong>. Add an update to
            <strong> each ticket</strong> stating its <strong>current status</strong> and
            <strong> what troubleshooting took place</strong>.
          </div>}

          {/* Admin: opened / closed / updated per on-shift tech */}
          {isAdmin && team.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                <Stat label="On shift" value={team.length} />
                <Stat label="Opened"   value={sum("opened")} />
                <Stat label="Closed"   value={sum("closed")} color="#7EEFC4" />
                <Stat label="Updated"  value={`${sum("updated")}/${sum("total")}`} />
              </div>
              {team.map(m => (
                <div key={m.name + m.started_at} className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>On shift {fmtTime(m.started_at)}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    <Stat label="Tickets opened" value={m.opened ?? 0} small />
                    <Stat label="Tickets closed" value={m.closed ?? 0} color="#7EEFC4" small />
                    <Stat label="Assigned updated" value={`${m.updated}/${m.total}`}
                      color={m.total > 0 && m.updated === m.total ? "#7EEFC4" : "#FFB627"} small />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginTop: 6 }}>
                Opened and closed count Christmas tickets for this day. "Assigned updated" is how many of the
                tickets handed to them at shift start have had an update added.
              </div>
            </>
          )}

          {/* Not on shift yet */}
          {isShowTech && !onShift && (
            <div className="card" style={{ padding: "20px 18px", textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
                You haven't started your shift yet. Starting your shift assigns you about a quarter of the
                open Christmas tickets.
              </div>
              {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 10 }}>{error}</div>}
              <button className="btn primary" style={{ width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700 }}
                onClick={startShift} disabled={starting}>
                {starting ? "Starting shift…" : "Start shift & get my tickets"}
              </button>
            </div>
          )}

          {/* Progress */}
          {onShift && tasks.length > 0 && (
            <div className="card" style={{ padding: "13px 16px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                <span style={{ color: "var(--text)" }}>{allDone ? "✅ All tickets updated" : "Tickets updated"}</span>
                <span style={{ color: allDone ? "#7EEFC4" : "#FFB627" }}>{done} of {tasks.length}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${(done / tasks.length) * 100}%`, height: "100%", borderRadius: 3, background: allDone ? "#2EE8A0" : "#FFB627" }} />
              </div>
            </div>
          )}

          {onShift && tasks.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🎄</div>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
                You're on shift, but there were no unclaimed open Christmas tickets to assign.
                Walk the park and log anything you find.
              </div>
            </div>
          )}

          {/* Task list */}
          {tasks.map(t => {
            const fixed = t.status === "fixed";
            return (
              <Link key={t.ticket_id} to={`/christmas/${t.ticket_id}`} className="card" style={{
                display: "block", textDecoration: "none", padding: "14px 16px", marginBottom: 10,
                borderColor: t.updated ? "rgba(46,232,160,0.35)" : "rgba(255,182,39,0.35)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      #{t.ticket_id} — {t.location}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                      {t.description}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted2, var(--muted))", marginTop: 6 }}>
                      Reported {fmtDay(t.created_at)} by {t.reported_by}{fixed ? " · Marked fixed" : ""}
                    </div>
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap",
                    background: t.updated ? "rgba(126,239,196,0.15)" : "rgba(255,182,39,0.12)",
                    color: t.updated ? "#7EEFC4" : "#FFB627",
                  }}>
                    {t.updated ? "✓ Updated" : "Needs update"}
                  </span>
                </div>
                {t.last_update ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 12, color: "var(--muted)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    <strong style={{ color: "var(--text)" }}>{t.last_update.author}</strong> · {fmtTime(t.last_update.created_at)} — {t.last_update.body}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#FFB627" }}>
                    Tap to open the ticket and add your update →
                  </div>
                )}
              </Link>
            );
          })}

          {/* Who is on shift */}
          {!isAdmin && team.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
                On shift today
              </div>
              <div className="card" style={{ padding: "4px 16px" }}>
                {team.map((m, i) => (
                  <div key={m.name + m.started_at} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid rgba(255,255,255,0.07)" : undefined }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.name}{m.is_me ? " (you)" : ""}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Started {fmtTime(m.started_at)}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", color: m.total > 0 && m.updated === m.total ? "#7EEFC4" : "var(--muted)" }}>
                      {m.updated} of {m.total} updated
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isShowTech && team.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center", fontSize: 14, color: "var(--muted)" }}>
              No show techs started a shift {viewingToday ? "today" : "on this day"}.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color, small }: { label: string; value: React.ReactNode; color?: string; small?: boolean }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: small ? "9px 8px" : "11px 8px", textAlign: "center" }}>
      <div style={{ fontSize: small ? 18 : 20, fontWeight: 800, color: color || "var(--text)", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
