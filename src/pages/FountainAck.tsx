import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, getProfile } from "../lib/auth";

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

type FountainStatus = "on" | "issue" | null;

// ─── Component ───────────────────────────────────────────────────────────────

export default function FountainAck() {
  const navigate = useNavigate();
  const profile  = getProfile();

  const [status, setStatus]       = useState<"loading" | "pending" | "done" | "error">("loading");
  const [existing, setExisting]   = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<"gps" | "saving" | null>(null);
  const [errorMsg, setErrorMsg]   = useState("");

  // Per-fountain state
  const [bayStatus,    setBayStatus]    = useState<FountainStatus>(null);
  const [bayNote,      setBayNote]      = useState("");
  const [lakeStatus,   setLakeStatus]   = useState<FountainStatus>(null);
  const [lakeNote,     setLakeNote]     = useState("");

  useEffect(() => {
    if (!getToken()) { navigate("/login", { replace: true }); return; }
    void checkToday();
  }, []);

  async function checkToday() {
    setStatus("loading");
    try {
      const res = await apiFetch("/api/fountain-ack-get");
      if (res.ack) {
        setExisting(res.ack);
        setStatus("done");
      } else {
        setStatus("pending");
      }
    } catch {
      setStatus("error");
    }
  }

  // Button enabled when both fountains have a status, and any "issue" has a note
  const canSubmit =
    bayStatus !== null &&
    lakeStatus !== null &&
    (bayStatus  === "on" || bayNote.trim()  !== "") &&
    (lakeStatus === "on" || lakeNote.trim() !== "");

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitStep("gps");
    setErrorMsg("");
    try {
      const coords = await getCoordsSafe();
      setSubmitStep("saving");
      const res = await apiFetch("/api/fountain-ack-submit", {
        method: "POST",
        body: JSON.stringify({
          bay_side_status: bayStatus,
          bay_side_note:   bayStatus === "issue" ? bayNote.trim() : null,
          lakeside_status: lakeStatus,
          lakeside_note:   lakeStatus === "issue" ? lakeNote.trim() : null,
          ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        }),
      });
      if (res.ok) {
        setExisting(res.ack);
        setStatus("done");
      } else {
        setErrorMsg(res.error || "Failed to submit. Please try again.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setSubmitting(false);
      setSubmitStep(null);
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="page fade-up" style={{ maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">💧 Lake Fountains</div>
        <div className="page-subtitle">Daily Operational Check-off</div>
      </div>

      {/* Date */}
      <div className="card" style={{ marginBottom: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>📅</span>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Today</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{today}</div>
        </div>
      </div>

      {/* Signed in as */}
      <div className="card" style={{ marginBottom: 24, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>👤</span>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Signed in as</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{profile?.name || "Unknown"}</div>
        </div>
      </div>

      {/* Loading */}
      {status === "loading" && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>Could not load today's status.</div>
          <button className="btn primary" onClick={checkToday}>Retry</button>
        </div>
      )}

      {/* Pending — sign-off form */}
      {status === "pending" && (
        <>
          {/* Issue guidance banner */}
          <div style={{
            background: "rgba(248,113,113,0.07)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 10,
            padding: "11px 14px",
            marginBottom: 16,
            fontSize: 12,
            color: "#fca5a5",
            lineHeight: 1.6,
          }}>
            ⚠️ <strong>Only select "Issue" if a fountain will not be operational for the rest of the day.</strong>{" "}
            If you fixed a problem and it's now running, select "On".
          </div>

          {/* Bay Side */}
          <FountainBlock
            label="Bay Side Fountains"
            icon="🌊"
            fountainStatus={bayStatus}
            note={bayNote}
            onStatusChange={setBayStatus}
            onNoteChange={setBayNote}
          />

          {/* Lakeside */}
          <FountainBlock
            label="Lakeside Fountains"
            icon="🏞️"
            fountainStatus={lakeStatus}
            note={lakeNote}
            onStatusChange={setLakeStatus}
            onNoteChange={setLakeNote}
          />

          {errorMsg && (
            <div style={{ fontSize: 13, color: "#f87171", marginBottom: 14 }}>{errorMsg}</div>
          )}

          {/* Submit */}
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 16 }}>
              By tapping <strong>Confirm &amp; Sign Off</strong> you confirm that the above statuses are accurate.
              Your name, employee ID, timestamp, and location will be recorded.
            </div>
            <button
              className="btn primary"
              style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700, opacity: canSubmit && !submitting ? 1 : 0.5, cursor: canSubmit && !submitting ? "pointer" : "not-allowed" }}
              onClick={submit}
              disabled={!canSubmit || submitting}
            >
              {submitStep === "gps" ? "📍 Getting location…" : submitStep === "saving" ? "Saving…" : "✅ Confirm & Sign Off"}
            </button>
          </div>
        </>
      )}

      {/* Done */}
      {status === "done" && existing && (
        <div className="card" style={{ padding: "24px 20px", borderColor: "rgba(46,232,160,0.4)" }}>
          <div style={{ fontSize: 32, marginBottom: 12, textAlign: "center" }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#7EEFC4", marginBottom: 20, textAlign: "center" }}>
            Acknowledged for today
          </div>

          {/* Fountain summaries */}
          <FountainDoneRow
            label="Bay Side Fountains"
            fountainStatus={existing.bay_side_status}
            note={existing.bay_side_note}
          />
          <FountainDoneRow
            label="Lakeside Fountains"
            fountainStatus={existing.lakeside_status}
            note={existing.lakeside_note}
            style={{ marginBottom: 16 }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            <Row label="Signed by"   value={existing.employee_name} />
            <Row label="Employee ID" value={existing.employee_id_text} />
            <Row label="Date & Time" value={fmtDateTime(existing.acked_at)} />
            {existing.lat != null && existing.lon != null
              ? <Row label="Location" value={`${existing.lat.toFixed(5)}, ${existing.lon.toFixed(5)}`} />
              : <Row label="Location" value="GPS not captured" />
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FountainBlock({
  label, icon, fountainStatus, note, onStatusChange, onNoteChange,
}: {
  label: string;
  icon: string;
  fountainStatus: FountainStatus;
  note: string;
  onStatusChange: (s: FountainStatus) => void;
  onNoteChange: (n: string) => void;
}) {
  const isOn    = fountainStatus === "on";
  const isIssue = fountainStatus === "issue";

  return (
    <div className="card" style={{ marginBottom: 12, overflow: "hidden", padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: isIssue ? "1px solid rgba(255,255,255,0.07)" : undefined }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
          {icon} {label}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onStatusChange("on")}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              border: isOn ? "1px solid rgba(126,239,196,0.4)" : "1px solid rgba(255,255,255,0.1)",
              background: isOn ? "rgba(126,239,196,0.15)" : "transparent",
              color: isOn ? "#7EEFC4" : "var(--muted)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ✓ On
          </button>
          <button
            onClick={() => onStatusChange("issue")}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              border: isIssue ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(255,255,255,0.1)",
              background: isIssue ? "rgba(248,113,113,0.12)" : "transparent",
              color: isIssue ? "#f87171" : "var(--muted)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ✗ Issue
          </button>
        </div>
      </div>

      {isIssue && (
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#f87171", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
            ⚠️ Describe the issue (required)
          </div>
          <textarea
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            rows={3}
            placeholder="e.g. South fountain not running, breaker tripped…"
            style={{
              width: "100%",
              background: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 8,
              color: "var(--text)",
              fontFamily: "inherit",
              fontSize: 13,
              padding: "9px 12px",
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
    </div>
  );
}

function FountainDoneRow({
  label, fountainStatus, note, style,
}: {
  label: string;
  fountainStatus: "on" | "issue";
  note?: string | null;
  style?: React.CSSProperties;
}) {
  const ok = fountainStatus === "on";
  return (
    <div style={{
      background: ok ? "rgba(126,239,196,0.07)" : "rgba(248,113,113,0.07)",
      border: `1px solid ${ok ? "rgba(126,239,196,0.25)" : "rgba(248,113,113,0.25)"}`,
      borderRadius: 8,
      padding: "10px 14px",
      marginBottom: 8,
      ...style,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: ok ? "#7EEFC4" : "#f87171" }}>
        {ok ? "✅" : "⚠️"} {label} — {ok ? "On & Functioning" : "Issue Reported"}
      </div>
      {!ok && note && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{note}</div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
      <span style={{ color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
