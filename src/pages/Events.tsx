import React, { useEffect, useRef, useState } from "react";
import { listBeoEvents, uploadBeo, completeBeoAction, uploadBeoPhoto } from "../lib/api";

const TZ = "America/New_York";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function monthStr(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function isToday(dateStr: string) {
  return dateStr === todayStr();
}

function isPast(dateStr: string) {
  return dateStr < todayStr();
}

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);

  async function load(offset = monthOffset) {
    setLoading(true);
    try {
      const res: any = await listBeoEvents(monthStr(offset));
      if (res?.ok) setEvents((res.data ?? res).events || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void load(); }, [monthOffset]);

  async function onPdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadStatus(null);
    setUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const result: any = await uploadBeo({ pdf_base64: base64, filename: file.name });
      if (!result?.ok) throw new Error(result?.error || "Upload failed");
      const ev = (result.data ?? result).event;
      setUploadStatus({ ok: true, msg: `✓ "${ev.event_name}" added for ${fmtDate(ev.event_date)}` });
      await load();
    } catch (err: any) {
      setUploadStatus({ ok: false, msg: err?.message || "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function onAction(beo_id: string, action_type: "setup" | "strike") {
    setActionBusy(`${beo_id}-${action_type}`);
    try {
      const res: any = await completeBeoAction(beo_id, action_type);
      if (!res?.ok) throw new Error(res?.error || "Failed");
      await load();
    } catch (err: any) {
      alert(err?.message || "Failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !photoTargetId) return;
    setPhotoBusy(photoTargetId);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const result: any = await uploadBeoPhoto({
        beo_id: photoTargetId,
        image_base64: base64,
        content_type: file.type || "image/jpeg",
      });
      if (!result?.ok) throw new Error(result?.error || "Photo upload failed");
      await load();
    } catch (err: any) {
      alert(err?.message || "Photo upload failed");
    } finally {
      setPhotoBusy(null);
      setPhotoTargetId(null);
    }
  }

  const currentMonth = new Date();
  currentMonth.setMonth(currentMonth.getMonth() + monthOffset);
  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Group events by date
  const grouped = events.reduce((acc: Record<string, any[]>, ev) => {
    acc[ev.event_date] = acc[ev.event_date] || [];
    acc[ev.event_date].push(ev);
    return acc;
  }, {});

  return (
    <div className="page fade-up" style={{ paddingBottom: 90 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <div className="page-title">Events</div>
          <div className="page-subtitle">BEO Calendar</div>
        </div>
        <button
          className="btn primary"
          style={{ fontSize: 13, padding: "8px 14px" }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <><span className="spinner" /> Reading…</> : "📄 Upload BEO"}
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={onPdfFile} />
      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPhotoFile} />

      {uploadStatus && (
        <div style={{
          marginBottom: 12, padding: "10px 13px", borderRadius: 10, fontSize: 13,
          background: uploadStatus.ok ? "var(--success-bg)" : "var(--danger-bg)",
          color: uploadStatus.ok ? "#7EEFC4" : "#FFB0B0",
          border: `1px solid ${uploadStatus.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}`,
        }}>{uploadStatus.msg}</div>
      )}

      {/* Month navigation */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => setMonthOffset(o => o - 1)} style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", fontSize: 14,
        }}>‹</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{monthLabel}</div>
        <button onClick={() => setMonthOffset(o => o + 1)} style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", fontSize: 14,
        }}>›</button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: "28px", textAlign: "center" }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
          <div className="muted" style={{ fontSize: 13 }}>Loading events…</div>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card" style={{ padding: "32px", textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>No events this month.</div>
          <div style={{ fontSize: 13, color: "var(--muted2)", marginTop: 4 }}>Upload a BEO PDF to add one.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEvents]) => (
            <div key={date}>
              {/* Date header */}
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
                color: isToday(date) ? "#B0B8FF" : "var(--muted2)",
                marginBottom: 6, display: "flex", alignItems: "center", gap: 8,
              }}>
                {isToday(date) && <span style={{
                  background: "rgba(92,107,255,0.2)", color: "#B0B8FF",
                  padding: "1px 7px", borderRadius: 99, fontSize: 10,
                }}>TODAY</span>}
                {fmtDate(date)}
              </div>

              {(dayEvents as any[]).map(ev => {
                const setupAction = ev.beo_actions?.find((a: any) => a.action_type === "setup");
                const strikeAction = ev.beo_actions?.find((a: any) => a.action_type === "strike");
                const isExpanded = expandedId === ev.id;
                const photos: any[] = ev.beo_photos || [];

                return (
                  <div key={ev.id} className="card" style={{
                    padding: "14px 16px",
                    borderLeft: isToday(date) ? "3px solid rgba(92,107,255,0.6)" : undefined,
                    opacity: isPast(date) && !isToday(date) ? 0.75 : 1,
                  }}>
                    {/* Event header */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                          {ev.event_name}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {/* Setup badge */}
                          {setupAction ? (
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                              background: "rgba(46,232,160,0.12)", color: "#7EEFC4",
                              border: "1px solid rgba(46,232,160,0.2)",
                            }}>
                              ✓ Setup — {setupAction.employees?.name} {fmtTime(setupAction.completed_at)}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                              background: "rgba(255,182,39,0.1)", color: "#FFD07A",
                              border: "1px solid rgba(255,182,39,0.2)",
                            }}>⏳ Setup pending</span>
                          )}
                          {/* Strike badge */}
                          {strikeAction ? (
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                              background: "rgba(46,232,160,0.12)", color: "#7EEFC4",
                              border: "1px solid rgba(46,232,160,0.2)",
                            }}>
                              ✓ Strike — {strikeAction.employees?.name} {fmtTime(strikeAction.completed_at)}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                              background: "rgba(255,255,255,0.06)", color: "var(--muted2)",
                              border: "1px solid var(--border)",
                            }}>Strike pending</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--muted)", fontSize: 18, padding: "0 4px", lineHeight: 1,
                        }}
                      >{isExpanded ? "▲" : "▼"}</button>
                    </div>

                    {/* Expanded section */}
                    {isExpanded && (
                      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                        {/* View PDF */}
                        {ev.pdf_url ? (
                          <a
                            href={ev.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 13 }}
                          >
                            📄 View BEO PDF
                          </a>
                        ) : (
                          <div style={{ fontSize: 13, color: "var(--muted2)", marginBottom: 14, fontStyle: "italic" }}>
                            📄 PDF expired (auto-deleted after 2 days)
                          </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                          {!setupAction && (
                            <button
                              className="btn primary small"
                              disabled={actionBusy === `${ev.id}-setup`}
                              onClick={() => onAction(ev.id, "setup")}
                            >
                              {actionBusy === `${ev.id}-setup` ? <span className="spinner" /> : "✓ Mark Setup Complete"}
                            </button>
                          )}
                          {!strikeAction && (
                            <button
                              className="btn small"
                              style={{ background: "rgba(255,84,84,0.12)", color: "#FFB0B0", border: "1px solid rgba(255,84,84,0.25)" }}
                              disabled={actionBusy === `${ev.id}-strike`}
                              onClick={() => onAction(ev.id, "strike")}
                            >
                              {actionBusy === `${ev.id}-strike` ? <span className="spinner" /> : "✓ Mark Strike Complete"}
                            </button>
                          )}
                        </div>

                        {/* Photos */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 8 }}>
                            Photos {photos.length > 0 ? `(${photos.length})` : ""}
                          </div>
                          {photos.length > 0 && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                              {photos.map((p: any, i: number) => (
                                <a key={i} href={p.public_url} target="_blank" rel="noopener noreferrer">
                                  <img src={p.public_url} alt="Event photo"
                                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />
                                </a>
                              ))}
                            </div>
                          )}
                          <button
                            className="btn small"
                            disabled={photoBusy === ev.id}
                            onClick={() => { setPhotoTargetId(ev.id); photoInputRef.current?.click(); }}
                          >
                            {photoBusy === ev.id ? <><span className="spinner" /> Uploading…</> : "📷 Add Photo"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
