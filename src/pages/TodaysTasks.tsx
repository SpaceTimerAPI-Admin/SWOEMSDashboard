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
type TeamRow = { name: string; started_at: string; total: number; updated: number; is_me: boolean };

export default function TodaysTasks() {
  const navigate = useNavigate();
  const isShowTech = getRole() === "show_tech";

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
    setState("ready");
  }

  async function load() {
    try {
      const res = await apiFetch("/api/showtech-tasks");
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

  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
  });
  const done = tasks.filter(t => t.updated).length;
  const allDone = tasks.length > 0 && done === tasks.length;

  return (
    <div className="page fade-up" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">📋 Today's Tasks</div>
        <div className="page-subtitle">{today}</div>
      </div>

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
          {/* The rule — always visible */}
          <div style={{
            background: "rgba(255,182,39,0.08)", border: "1px solid rgba(255,182,39,0.3)",
            borderRadius: 12, padding: "13px 15px", marginBottom: 16,
            fontSize: 13, color: "var(--text)", lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: "#FFB627", marginBottom: 4 }}>⚠️ Required this shift</div>
            Every ticket below <strong>must be reviewed during today's shift</strong>. Add an update to
            <strong> each ticket</strong> stating its <strong>current status</strong> and
            <strong> what troubleshooting took place</strong>.
          </div>

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
          {team.length > 0 && (
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
              No show techs have started a shift today.
            </div>
          )}
        </>
      )}
    </div>
  );
}
