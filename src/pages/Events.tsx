import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listBeoEvents, listDeletedBeoEvents, uploadBeo, completeBeoAction, uploadBeoPhoto, restoreBeoEvent } from "../lib/api";

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

function isToday(dateStr: string) { return dateStr === todayStr(); }
function isPast(dateStr: string) { return dateStr < todayStr(); }

type UploadResult = { filename: string; ok: boolean; msg: string };

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dropInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [fileDateOverrides, setFileDateOverrides] = useState<string[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  // Deleted events panel
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedEvents, setDeletedEvents] = useState<any[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function load(offset?: number) {
    const off = offset !== undefined ? offset : monthOffset;
    setLoading(true);
    try {
      const res: any = await listBeoEvents(monthStr(off));
      if (res?.ok) setEvents((res.data ?? res).events || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void load(monthOffset); }, [monthOffset]);

  function addFiles(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (pdfs.length === 0) return;
    setQueuedFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      const newOnes = pdfs.filter(f => !names.has(f.name));
      setFileDateOverrides(prevD => [...prevD, ...newOnes.map(() => "")]);
      return [...prev, ...newOnes];
    });
  }

  function removeQueued(idx: number) {
    setQueuedFiles(prev => prev.filter((_, i) => i !== idx));
    setFileDateOverrides(prev => prev.filter((_, i) => i !== idx));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  async function processQueue() {
    if (queuedFiles.length === 0) return;
    setUploadResults([]);
    const results: UploadResult[] = [];

    for (let i = 0; i < queuedFiles.length; i++) {
      const file = queuedFiles[i];
      setUploadingIndex(i);
      try {
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(",")[1]);
          r.onerror = () => rej(new Error("Read failed"));
          r.readAsDataURL(file);
        });
        const override = fileDateOverrides[i];
        const result: any = await uploadBeo({
          pdf_base64: base64,
          filename: file.name,
          ...(override ? { event_date: override } : {}),
        });
        if (!result?.ok) throw new Error(result?.error || "Upload failed");
        const data = result.data ?? result;
        const ev = data.event;
        const isRevision = data.action === "updated";
        results.push({
          filename: file.name,
          ok: true,
          msg: isRevision
            ? `Revised — updated to "${ev.event_name}" for ${fmtDate(ev.event_date)}`
            : `Added — "${ev.event_name}" on ${fmtDate(ev.event_date)}`,
        });
      } catch (err: any) {
        results.push({ filename: file.name, ok: false, msg: err?.message || "Upload failed" });
      }
    }

    setUploadingIndex(null);
    setUploadResults(results);
    setQueuedFiles([]);
    setFileDateOverrides([]);
    await load(monthOffset);
  }

  function closeModal() {
    setShowUploadModal(false);
    setQueuedFiles([]);
    setFileDateOverrides([]);
    setUploadResults([]);
    setUploadingIndex(null);
    setDragOver(false);
  }

  async function loadDeleted() {
    setDeletedLoading(true);
    try {
      const res: any = await listDeletedBeoEvents();
      if (res?.ok) setDeletedEvents((res.data ?? res).events || []);
    } catch {}
    setDeletedLoading(false);
  }

  async function handleRestore(beo_id: string) {
    setRestoringId(beo_id);
    try {
      const res: any = await restoreBeoEvent(beo_id);
      if (!res?.ok) throw new Error(res?.error || "Failed to restore");
      await Promise.all([load(monthOffset), loadDeleted()]);
    } catch (err: any) {
      alert(err?.message || "Failed to restore");
    } finally {
      setRestoringId(null);
    }
  }

  async function onAction(beo_id: string, action_type: "setup" | "strike") {
    setActionBusy(`${beo_id}-${action_type}`);
    try {
      const res: any = await completeBeoAction(beo_id, action_type);
      if (!res?.ok) throw new Error(res?.error || "Failed");
      await load(monthOffset);
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
      await load(monthOffset);
    } catch (err: any) {
      alert(err?.message || "Photo upload failed");
    } finally {
      setPhotoBusy(null);
      setPhotoTargetId(null);
    }
  }

  const isUploading = uploadingIndex !== null;
  const currentMonth = new Date();
  currentMonth.setMonth(currentMonth.getMonth() + monthOffset);
  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => { setShowDeleted(v => { if (!v) loadDeleted(); return !v; }); }}
            style={{
              padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
              background: showDeleted ? "rgba(255,84,84,0.1)" : "rgba(255,255,255,0.05)",
              color: showDeleted ? "#FFB0B0" : "var(--muted)",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            🗑 Deleted
          </button>
          <button
            className="btn primary"
            style={{ fontSize: 13, padding: "8px 14px" }}
            onClick={() => { setShowUploadModal(true); setUploadResults([]); }}
          >
            📄 Upload BEO
          </button>
        </div>
      </div>

      {/* Deleted Events Panel */}
      {showDeleted && (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 16, border: "1px solid rgba(255,84,84,0.25)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#FFB0B0", marginBottom: 12 }}>
            🗑 Deleted Events
          </div>
          {deletedLoading ? (
            <div style={{ fontSize: 13, color: "var(--muted2)" }}>Loading…</div>
          ) : deletedEvents.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted2)", fontStyle: "italic" }}>No deleted events.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deletedEvents.map((ev: any) => (
                <div key={ev.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, padding: "10px 12px", borderRadius: 8,
                  background: "rgba(255,84,84,0.06)", border: "1px solid rgba(255,84,84,0.15)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                      {ev.event_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                      {fmtDate(ev.event_date)}
                      {ev.deleted_reason && <> · <span style={{ color: "#FFB0B0" }}>{ev.deleted_reason}</span></>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(ev.id)}
                    disabled={restoringId === ev.id}
                    style={{
                      padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(46,232,160,0.3)",
                      background: "rgba(46,232,160,0.1)", color: "#7EEFC4",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    }}
                  >
                    {restoringId === ev.id ? <span className="spinner" /> : "↩ Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={dropInputRef}
        type="file"
        accept="application/pdf"
        multiple
        style={{ display: "none" }}
        onChange={e => { addFiles(e.target.files || []); e.target.value = ""; }}
      />
      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPhotoFile} />

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="card modal-card" style={{ maxWidth: 480, width: "100%" }}>
            <div className="modal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="modal-title">Upload BEO PDFs</h3>
              <button onClick={closeModal} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">

              {/* Drag and drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => dropInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "rgba(92,107,255,0.7)" : "rgba(255,255,255,0.15)"}`,
                  borderRadius: 12,
                  padding: "28px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "rgba(92,107,255,0.08)" : "rgba(255,255,255,0.03)",
                  transition: "all 0.15s",
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  Drag & drop PDFs here
                </div>
                <div style={{ fontSize: 12, color: "var(--muted2)" }}>
                  or tap to browse — multiple files supported
                </div>
              </div>

              {/* Queued files */}
              {queuedFiles.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted2)", marginBottom: 8 }}>
                    Ready to upload ({queuedFiles.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {queuedFiles.map((f, i) => (
                      <div key={i} style={{
                        padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            {isUploading && uploadingIndex === i ? (
                              <span className="spinner" />
                            ) : (
                              <span style={{ fontSize: 14 }}>📄</span>
                            )}
                            <span style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.name}
                            </span>
                          </div>
                          {!isUploading && (
                            <button
                              onClick={() => removeQueued(i)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted2)", fontSize: 16, flexShrink: 0 }}
                            >×</button>
                          )}
                        </div>
                        {/* Optional date override */}
                        {!isUploading && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <label style={{ fontSize: 11, color: "var(--muted2)", whiteSpace: "nowrap" }}>Override date:</label>
                            <input
                              type="date"
                              className="input"
                              style={{ fontSize: 12, padding: "4px 8px", flex: 1 }}
                              value={fileDateOverrides[i] || ""}
                              onChange={e => setFileDateOverrides(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload results */}
              {uploadResults.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted2)", marginBottom: 8 }}>
                    Results
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {uploadResults.map((r, i) => (
                      <div key={i} style={{
                        padding: "8px 12px", borderRadius: 8, fontSize: 13,
                        background: r.ok ? "var(--success-bg)" : "var(--danger-bg)",
                        color: r.ok ? "#7EEFC4" : "#FFB0B0",
                        border: `1px solid ${r.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}`,
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{r.ok ? "✓" : "✗"} {r.filename}</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>{r.msg}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn small" onClick={closeModal} disabled={isUploading}>
                  {uploadResults.length > 0 ? "Close" : "Cancel"}
                </button>
                {queuedFiles.length > 0 && (
                  <button
                    className="btn primary small"
                    onClick={processQueue}
                    disabled={isUploading}
                  >
                    {isUploading
                      ? <><span className="spinner" /> Uploading {uploadingIndex! + 1}/{queuedFiles.length}…</>
                      : `Upload ${queuedFiles.length} PDF${queuedFiles.length > 1 ? "s" : ""}`
                    }
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
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

              {(dayEvents as any[]).map((ev: any) => {
                const setupAction = ev.beo_actions?.find((a: any) => a.action_type === "setup");
                const strikeAction = ev.beo_actions?.find((a: any) => a.action_type === "strike");
                const photos: any[] = ev.beo_photos || [];
                return (
                  <Link
                    key={ev.id}
                    to={`/events/${ev.id}`}
                    className="card"
                    style={{
                      display: "block", textDecoration: "none", padding: "14px 16px",
                      borderLeft: isToday(date) ? "3px solid rgba(92,107,255,0.6)" : undefined,
                      opacity: isPast(date) && !isToday(date) ? 0.8 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                          {ev.event_name}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                            background: setupAction ? "rgba(46,232,160,0.12)" : "rgba(255,182,39,0.1)",
                            color: setupAction ? "#7EEFC4" : "#FFD07A",
                            border: `1px solid ${setupAction ? "rgba(46,232,160,0.2)" : "rgba(255,182,39,0.2)"}`,
                          }}>
                            {setupAction ? `✓ Setup` : "⏳ Setup pending"}
                          </span>
                          <span style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                            background: strikeAction ? "rgba(46,232,160,0.12)" : "rgba(255,255,255,0.06)",
                            color: strikeAction ? "#7EEFC4" : "var(--muted2)",
                            border: `1px solid ${strikeAction ? "rgba(46,232,160,0.2)" : "var(--border)"}`,
                          }}>
                            {strikeAction ? "✓ Strike" : "Strike pending"}
                          </span>
                          {photos.length > 0 && (
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                              background: "rgba(255,255,255,0.06)", color: "var(--muted2)",
                              border: "1px solid var(--border)",
                            }}>📷 {photos.length}</span>
                          )}
                        </div>
                      </div>
                      <span style={{ color: "var(--muted2)", fontSize: 16, flexShrink: 0 }}>›</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
