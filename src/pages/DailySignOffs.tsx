import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, getProfile } from "../lib/auth";
import ParkHours from "../components/ParkHours";

// ─── GPS helpers ────────────────────────────────────────────────────────────

function getPositionOnce(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}

async function getCoordsSafe(): Promise<{ lat: number; lon: number } | null> {
  if (!navigator.geolocation) return null;
  const attempts: PositionOptions[] = [
    { enableHighAccuracy: true,  timeout: 12000, maximumAge: 0 },
    { enableHighAccuracy: false, timeout: 8000,  maximumAge: 0 },
  ];
  for (const opts of attempts) {
    try {
      const pos = await getPositionOnce(opts);
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch { /* try next */ }
  }
  return null;
}

// ─── API ─────────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

type Choice = "ok" | "issue" | null;

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────
// One page for every daily sign-off. Each sign-off is signed separately and
// records who signed it and when.

export default function DailySignOffs() {
  const navigate = useNavigate();
  const profile  = getProfile();

  const [status, setStatus]     = useState<"loading" | "ready" | "error">("loading");
  const [fountain, setFountain] = useState<any>(null);
  const [snow, setSnow]         = useState<any>(null);
  const [snowError, setSnowError] = useState<string | null>(null);
  const [history, setHistory]   = useState<{ fountain: any[]; snow: any[] }>({ fountain: [], snow: [] });

  useEffect(() => {
    if (!getToken()) { navigate("/login", { replace: true }); return; }
    void load();
  }, []);

  async function load() {
    try {
      const res = await apiFetch("/api/daily-signoffs-get");
      if (!res.ok) { setStatus("error"); return; }
      setFountain(res.fountain || null);
      setSnow(res.snow || null);
      setSnowError(res.snow_error || null);
      setHistory({ fountain: res.history?.fountain || [], snow: res.history?.snow || [] });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const doneCount = (fountain ? 1 : 0) + (snow ? 1 : 0);

  return (
    <div className="page fade-up" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">✅ Daily Sign Offs</div>
        <div className="page-subtitle">{today}</div>
        <ParkHours />
      </div>

      <div className="card" style={{ marginBottom: 20, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>👤</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Signed in as</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{profile?.name || "Unknown"}</div>
        </div>
        {status === "ready" && (
          <div style={{ fontSize: 12, fontWeight: 700, color: doneCount === 2 ? "#7EEFC4" : "var(--muted)" }}>
            {doneCount} of 2 done
          </div>
        )}
      </div>

      {status === "loading" && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      )}

      {status === "error" && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>Could not load today's sign-offs.</div>
          <button className="btn primary" onClick={() => { setStatus("loading"); void load(); }}>Retry</button>
        </div>
      )}

      {status === "ready" && (
        <>
          <FountainSection ack={fountain} onSigned={() => void load()} />
          <SnowSection ack={snow} tableError={snowError} onSigned={() => void load()} />
          <History fountain={history.fountain} snow={history.snow} />
        </>
      )}
    </div>
  );
}

// ─── Shared submit helper ────────────────────────────────────────────────────

function useSignOff(path: string, onSigned: () => void) {
  const [step, setStep] = useState<"gps" | "saving" | null>(null);
  const [error, setError] = useState("");

  async function submit(payload: Record<string, unknown>) {
    setStep("gps");
    setError("");
    try {
      const coords = await getCoordsSafe();
      setStep("saving");
      const res = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ ...payload, ...(coords ? { lat: coords.lat, lon: coords.lon } : {}) }),
      });
      if (res.ok) onSigned();
      else setError(res.error || "Failed to submit. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStep(null);
    }
  }

  return { step, error, submit };
}

// ─── Lake Fountains ──────────────────────────────────────────────────────────

function FountainSection({ ack, onSigned }: { ack: any; onSigned: () => void }) {
  const [bay, setBay]           = useState<Choice>(null);
  const [bayNote, setBayNote]   = useState("");
  const [lake, setLake]         = useState<Choice>(null);
  const [lakeNote, setLakeNote] = useState("");
  const { step, error, submit } = useSignOff("/api/fountain-ack-submit", onSigned);

  const canSubmit =
    bay !== null && lake !== null &&
    (bay  === "ok" || bayNote.trim()  !== "") &&
    (lake === "ok" || lakeNote.trim() !== "");

  return (
    <Section icon="💧" title="Lake Fountains" due="Morning check · 8:00 AM" done={!!ack}>
      {ack ? (
        <>
          <DoneRow label="Bay Side Fountains" ok={ack.bay_side_status !== "issue"} okText="On & Functioning" note={ack.bay_side_note} />
          <DoneRow label="Lakeside Fountains" ok={ack.lakeside_status !== "issue"} okText="On & Functioning" note={ack.lakeside_note} />
          <SignedBy ack={ack} />
        </>
      ) : (
        <>
          <Hint>
            <strong>Only select "Issue" if a fountain will not be operational for the rest of the day.</strong>{" "}
            If you fixed a problem and it's now running, select "On".
          </Hint>
          <ChoiceBlock label="Bay Side Fountains" icon="🌊" okLabel="On" choice={bay} note={bayNote}
            onChoice={setBay} onNote={setBayNote} placeholder="e.g. South fountain not running, breaker tripped…" />
          <ChoiceBlock label="Lakeside Fountains" icon="🏞️" okLabel="On" choice={lake} note={lakeNote}
            onChoice={setLake} onNote={setLakeNote} placeholder="e.g. Pump not priming…" />
          <SubmitRow canSubmit={canSubmit} step={step} error={error} onClick={() => submit({
            bay_side_status: bay === "issue" ? "issue" : "on",
            bay_side_note:   bay === "issue" ? bayNote.trim() : null,
            lakeside_status: lake === "issue" ? "issue" : "on",
            lakeside_note:   lake === "issue" ? lakeNote.trim() : null,
          })} />
        </>
      )}
    </Section>
  );
}

// ─── Snow Moments ────────────────────────────────────────────────────────────

function SnowSection({ ack, tableError, onSigned }: { ack: any; tableError: string | null; onSigned: () => void }) {
  const [choice, setChoice] = useState<Choice>(null);
  const [note, setNote]     = useState("");
  const { step, error, submit } = useSignOff("/api/snow-ack-submit", onSigned);

  const canSubmit = choice !== null && (choice === "ok" || note.trim() !== "");

  return (
    <Section icon="❄️" title="Snow Moments" due="Afternoon check · 4:00 PM" done={!!ack}>
      {ack ? (
        <>
          <DoneRow label="Snow Moments" ok={ack.status !== "issue"} okText="Set on the UCI for park time" note={ack.note} />
          <SignedBy ack={ack} />
        </>
      ) : (
        <>
          <Hint>
            Set <strong>Snow Moments</strong> on the UCI corresponding to the appropriate park time, then sign off.
            Only select "Issue" if it could not be set.
          </Hint>
          {tableError && (
            <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>
              Snow Moments sign-off isn't set up in the database yet. An admin needs to run the setup SQL.
            </div>
          )}
          <ChoiceBlock label="Snow Moments on UCI" icon="❄️" okLabel="Set" choice={choice} note={note}
            onChoice={setChoice} onNote={setNote} placeholder="e.g. UCI not responding, schedule would not save…" />
          <SubmitRow canSubmit={canSubmit} step={step} error={error} onClick={() => submit({
            status: choice === "issue" ? "issue" : "set",
            note:   choice === "issue" ? note.trim() : null,
          })} />
        </>
      )}
    </Section>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────

function History({ fountain, snow }: { fountain: any[]; snow: any[] }) {
  const rows = [
    ...fountain.map(r => ({ key: `f${r.id}`, at: r.acked_at, what: "💧 Lake Fountains", who: r.employee_name,
      issue: r.bay_side_status === "issue" || r.lakeside_status === "issue" })),
    ...snow.map(r => ({ key: `s${r.id}`, at: r.acked_at, what: "❄️ Snow Moments", who: r.employee_name,
      issue: r.status === "issue" })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
        Recent sign-offs
      </div>
      <div className="card" style={{ padding: "4px 16px" }}>
        {rows.map((r, i) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid rgba(255,255,255,0.07)" : undefined }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {r.what}{r.issue && <span style={{ color: "#f87171", fontWeight: 700 }}> · Issue</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.who}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              <div>{fmtDay(r.at)}</div>
              <div>{fmtTime(r.at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function Section({ icon, title, due, done, children }: {
  icon: string; title: string; due: string; done: boolean; children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginBottom: 16, padding: "16px 16px 18px", borderColor: done ? "rgba(46,232,160,0.4)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{due}</div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
          background: done ? "rgba(126,239,196,0.15)" : "rgba(255,182,39,0.12)",
          color: done ? "#7EEFC4" : "#FFB627",
        }}>
          {done ? "✓ Signed" : "Not signed"}
        </span>
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)",
      borderRadius: 10, padding: "10px 13px", marginBottom: 12,
      fontSize: 12, color: "#fca5a5", lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

function pill(active: boolean, good: boolean): React.CSSProperties {
  const c = good ? "126,239,196" : "248,113,113";
  return {
    padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
    border: active ? `1px solid rgba(${c},0.4)` : "1px solid rgba(255,255,255,0.1)",
    background: active ? `rgba(${c},0.14)` : "transparent",
    color: active ? (good ? "#7EEFC4" : "#f87171") : "var(--muted)",
    cursor: "pointer", fontFamily: "inherit",
  };
}

function ChoiceBlock({ label, icon, okLabel, choice, note, onChoice, onNote, placeholder }: {
  label: string; icon: string; okLabel: string; choice: Choice; note: string;
  onChoice: (c: Choice) => void; onNote: (n: string) => void; placeholder: string;
}) {
  const isIssue = choice === "issue";
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 14px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{icon} {label}</div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => onChoice("ok")} style={pill(choice === "ok", true)}>✓ {okLabel}</button>
          <button type="button" onClick={() => onChoice("issue")} style={pill(isIssue, false)}>✗ Issue</button>
        </div>
      </div>
      {isIssue && (
        <div style={{ padding: "0 14px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#f87171", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
            ⚠️ Describe the issue (required)
          </div>
          <textarea
            value={note}
            onChange={e => onNote(e.target.value)}
            rows={3}
            placeholder={placeholder}
            style={{
              width: "100%", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 13,
              padding: "9px 12px", resize: "none", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      )}
    </div>
  );
}

function SubmitRow({ canSubmit, step, error, onClick }: {
  canSubmit: boolean; step: "gps" | "saving" | null; error: string; onClick: () => void;
}) {
  const enabled = canSubmit && !step;
  return (
    <>
      {error && <div style={{ fontSize: 13, color: "#f87171", margin: "4px 0 10px" }}>{error}</div>}
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, margin: "6px 0 12px" }}>
        Your name, employee ID, time, and location are recorded when you sign off.
      </div>
      <button
        className="btn primary"
        style={{ width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700, opacity: enabled ? 1 : 0.5, cursor: enabled ? "pointer" : "not-allowed" }}
        onClick={onClick}
        disabled={!enabled}
      >
        {step === "gps" ? "📍 Getting location…" : step === "saving" ? "Saving…" : "✅ Confirm & Sign Off"}
      </button>
    </>
  );
}

function DoneRow({ label, ok, okText, note }: { label: string; ok: boolean; okText: string; note?: string | null }) {
  return (
    <div style={{
      background: ok ? "rgba(126,239,196,0.07)" : "rgba(248,113,113,0.07)",
      border: `1px solid ${ok ? "rgba(126,239,196,0.25)" : "rgba(248,113,113,0.25)"}`,
      borderRadius: 8, padding: "10px 14px", marginBottom: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: ok ? "#7EEFC4" : "#f87171" }}>
        {ok ? "✅" : "⚠️"} {label} — {ok ? okText : "Issue Reported"}
      </div>
      {!ok && note && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{note}</div>
      )}
    </div>
  );
}

function SignedBy({ ack }: { ack: any }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      <Row label="Signed by"   value={ack.employee_name} />
      <Row label="Employee ID" value={ack.employee_id_text} />
      <Row label="Date & Time" value={fmtDateTime(ack.acked_at)} />
      <Row label="Location"    value={ack.lat != null && ack.lon != null ? `${ack.lat.toFixed(5)}, ${ack.lon.toFixed(5)}` : "GPS not captured"} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}
