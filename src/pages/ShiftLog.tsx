import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { addShiftLogEntry, listShiftLogEntries } from "../lib/api";
import { getProfile } from "../lib/auth";

const TZ = "America/New_York";

function fmtTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function ShiftLog() {
  const [entries, setEntries] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const profile = getProfile();

  async function load() {
    setLoading(true);
    try {
      const res: any = await listShiftLogEntries();
      if (res?.ok) setEntries(res.data?.entries || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function onAdd() {
    const trimmed = note.trim();
    if (!trimmed) return;
    setError(null);
    setSaving(true);
    try {
      const res: any = await addShiftLogEntry(trimmed);
      if (!res?.ok) throw new Error(res?.error || "Failed to add entry");
      const entry = res.data?.entry;
      setEntries(prev => [entry, ...prev]);
      setNote("");
      textareaRef.current?.focus();
    } catch (e: any) {
      setError(e?.message || "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void onAdd();
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="page fade-up">
      <Link to="/" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Home
      </Link>

      <div className="page-title">Shift Log</div>
      <div className="page-subtitle">{today}</div>

      {/* Add entry */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 16 }}>
        <div className="field-label">What did you do?</div>
        <textarea
          ref={textareaRef}
          className="textarea"
          style={{ minHeight: 72 }}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Replaced fuse on SH4 dimmer rack, tested and confirmed working…"
          disabled={saving}
        />
        {error && (
          <div style={{
            marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 13,
            background: "var(--danger-bg)", color: "#FFB0B0",
            border: "1px solid rgba(255,84,84,0.25)",
          }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--muted2)" }}>⌘ + Enter to submit</div>
          <button
            className="btn primary"
            onClick={onAdd}
            disabled={saving || !note.trim()}
            style={{ minWidth: 100 }}
          >
            {saving ? <><span className="spinner" /> Adding…</> : "Add Entry"}
          </button>
        </div>
      </div>

      {/* Entry feed */}
      {loading ? (
        <div className="card" style={{ padding: "24px 16px", textAlign: "center" }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
          <div className="muted" style={{ fontSize: 13 }}>Loading entries…</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="card" style={{ padding: "32px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📓</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>No entries yet today.</div>
          <div style={{ fontSize: 13, color: "var(--muted2)", marginTop: 4 }}>
            Add your first note above.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((entry) => {
            const isMe = entry.employee_id === profile?.id;
            return (
              <div
                key={entry.id}
                className="card"
                style={{
                  padding: "12px 14px",
                  borderLeft: isMe ? "3px solid rgba(92,107,255,0.5)" : "3px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: isMe ? "rgba(92,107,255,0.2)" : "rgba(255,255,255,0.08)",
                      border: `1px solid ${isMe ? "rgba(92,107,255,0.35)" : "rgba(255,255,255,0.1)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                      color: isMe ? "#B0B8FF" : "var(--muted)",
                    }}>
                      {(entry.employee_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isMe ? "#B0B8FF" : "var(--muted)" }}>
                      {isMe ? "You" : entry.employee_name}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted2)" }}>{fmtTime(entry.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>
                  {entry.note}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
