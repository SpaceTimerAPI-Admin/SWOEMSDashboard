import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getBeoEvent, completeBeoAction, deleteBeoEvent, uploadBeoPhoto } from "../lib/api";

const TZ = "America/New_York";

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

const ACTION_LABELS: Record<string, string> = {
  uploaded: "📄 BEO Uploaded",
  revised:  "🔄 Revised",
  setup:    "✓ Setup Complete",
  strike:   "✓ Strike Complete",
  deleted:  "🗑 Deleted",
  photo_added: "📷 Photo Added",
};

const DELETE_REASONS = ["Event Cancelled", "No EMS Involvement", "Dupe/Data Error"];

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionBusy, setActionBusy] = useState<"setup" | "strike" | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const res: any = await getBeoEvent(id);
      if (!res?.ok) throw new Error(res?.error || "Not found");
      setEvent((res.data ?? res).event);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function handleAction(action_type: "setup" | "strike") {
    setActionBusy(action_type);
    try {
      const res: any = await completeBeoAction(id!, action_type);
      if (!res?.ok) throw new Error(res?.error || "Failed");
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDelete() {
    if (!deleteReason) { setDeleteError("Please select a reason."); return; }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res: any = await deleteBeoEvent(id!, deleteReason);
      if (!res?.ok) throw new Error(res?.error || "Failed to delete");
      nav("/events");
    } catch (e: any) {
      setDeleteError(e?.message || "Failed to delete");
      setDeleteBusy(false);
    }
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;
    setPhotoBusy(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const result: any = await uploadBeoPhoto({
        beo_id: id,
        image_base64: base64,
        content_type: file.type || "image/jpeg",
      });
      if (!result?.ok) throw new Error(result?.error || "Upload failed");
      await load();
    } catch (e: any) {
      alert(e?.message || "Photo upload failed");
    } finally {
      setPhotoBusy(false);
    }
  }

  if (loading) return (
    <div className="page fade-up">
      <Link to="/events" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Events
      </Link>
      <div className="card" style={{ padding: "28px", textAlign: "center", marginTop: 16 }}>
        <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
        <div className="muted" style={{ fontSize: 13 }}>Loading event…</div>
      </div>
    </div>
  );

  if (error || !event) return (
    <div className="page fade-up">
      <Link to="/events" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Events
      </Link>
      <div className="card" style={{ padding: "24px", textAlign: "center", marginTop: 16 }}>
        <div style={{ color: "#FFB0B0" }}>{error || "Event not found"}</div>
      </div>
    </div>
  );

  const setupAction = event.beo_actions?.find((a: any) => a.action_type === "setup");
  const strikeAction = event.beo_actions?.find((a: any) => a.action_type === "strike");
  const photos: any[] = event.beo_photos || [];
  const log: any[] = event.beo_log || [];
  const isDeleted = !!event.deleted_at;

  return (
    <div className="page fade-up" style={{ paddingBottom: 90 }}>
      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPhotoFile} />

      <Link to="/events" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Events
      </Link>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 2 }}>{event.event_name}</div>
        <div className="page-subtitle">{fmtDate(event.event_date)}</div>
        {isDeleted && (
          <div style={{
            display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 99,
            fontSize: 12, fontWeight: 600, background: "rgba(255,84,84,0.12)",
            color: "#FFB0B0", border: "1px solid rgba(255,84,84,0.25)",
          }}>
            🗑 Deleted — {event.deleted_reason}
          </div>
        )}
      </div>

      {/* PDF */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
        <div className="field-label" style={{ marginBottom: 10 }}>BEO Document</div>
        {event.pdf_url ? (
          <a href={event.pdf_url} target="_blank" rel="noopener noreferrer"
            className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            📄 View PDF
          </a>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted2)", fontStyle: "italic" }}>
            PDF expired or removed
          </div>
        )}
      </div>

      {/* Setup / Strike */}
      {!isDeleted && (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div className="field-label" style={{ marginBottom: 12 }}>Setup & Strike</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Setup */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {setupAction ? (
                <div>
                  <span style={{
                    fontSize: 12, padding: "2px 9px", borderRadius: 99, fontWeight: 600,
                    background: "rgba(46,232,160,0.12)", color: "#7EEFC4",
                    border: "1px solid rgba(46,232,160,0.2)",
                  }}>✓ Setup Complete</span>
                  <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}>
                    {setupAction.employees?.name} · {fmtTime(setupAction.completed_at)}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Setup not yet completed</div>
              )}
              {!setupAction && (
                <button
                  className="btn primary small"
                  disabled={actionBusy === "setup"}
                  onClick={() => handleAction("setup")}
                >
                  {actionBusy === "setup" ? <span className="spinner" /> : "Mark Setup Done"}
                </button>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)" }} />

            {/* Strike */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {strikeAction ? (
                <div>
                  <span style={{
                    fontSize: 12, padding: "2px 9px", borderRadius: 99, fontWeight: 600,
                    background: "rgba(46,232,160,0.12)", color: "#7EEFC4",
                    border: "1px solid rgba(46,232,160,0.2)",
                  }}>✓ Strike Complete</span>
                  <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}>
                    {strikeAction.employees?.name} · {fmtTime(strikeAction.completed_at)}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Strike not yet completed</div>
              )}
              {!strikeAction && (
                <button
                  className="btn small"
                  style={{ background: "rgba(255,84,84,0.12)", color: "#FFB0B0", border: "1px solid rgba(255,84,84,0.25)" }}
                  disabled={actionBusy === "strike"}
                  onClick={() => handleAction("strike")}
                >
                  {actionBusy === "strike" ? <span className="spinner" /> : "Mark Strike Done"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Photos */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="field-label">Photos {photos.length > 0 ? `(${photos.length})` : ""}</div>
          {!isDeleted && (
            <button
              className="btn small"
              disabled={photoBusy}
              onClick={() => photoInputRef.current?.click()}
            >
              {photoBusy ? <span className="spinner" /> : "📷 Add Photo"}
            </button>
          )}
        </div>
        {photos.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted2)", fontStyle: "italic" }}>No photos yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {photos.map((p: any, i: number) => (
              <a key={i} href={p.public_url} target="_blank" rel="noopener noreferrer">
                <img src={p.public_url} alt="Event photo"
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
        <div className="field-label" style={{ marginBottom: 12 }}>Activity Log</div>
        {log.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted2)", fontStyle: "italic" }}>No activity yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {log.map((entry: any, i: number) => (
              <div key={entry.id} style={{
                display: "flex", gap: 12, paddingBottom: 12,
                borderBottom: i < log.length - 1 ? "1px solid var(--border)" : "none",
                marginBottom: i < log.length - 1 ? 12 : 0,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(92,107,255,0.15)", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 14,
                }}>
                  {entry.action === "uploaded" ? "📄" :
                   entry.action === "revised" ? "🔄" :
                   entry.action === "setup" ? "✓" :
                   entry.action === "strike" ? "✓" :
                   entry.action === "deleted" ? "🗑" :
                   entry.action === "photo_added" ? "📷" : "•"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {ACTION_LABELS[entry.action] || entry.action}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {entry.employees?.name} · {fmtTime(entry.created_at)}
                  </div>
                  {entry.note && (
                    <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 3 }}>{entry.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      {!isDeleted && (
        <div className="card" style={{ padding: "14px 16px" }}>
          <div className="field-label" style={{ marginBottom: 10 }}>Danger Zone</div>
          <button
            className="btn danger"
            onClick={() => { setShowDeleteModal(true); setDeleteReason(""); setDeleteError(null); }}
          >
            🗑 Delete Event
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <div className="modal-head">
              <h3 className="modal-title">Delete Event</h3>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
                This will remove <strong style={{ color: "var(--text)" }}>{event.event_name}</strong> and delete the PDF. The activity log is preserved. Please select a reason:
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {DELETE_REASONS.map(reason => (
                  <button
                    key={reason}
                    onClick={() => setDeleteReason(reason)}
                    style={{
                      padding: "10px 14px", borderRadius: 10, border: "1px solid",
                      cursor: "pointer", textAlign: "left", fontSize: 14,
                      fontWeight: deleteReason === reason ? 600 : 400,
                      borderColor: deleteReason === reason ? "rgba(255,84,84,0.5)" : "var(--border)",
                      background: deleteReason === reason ? "rgba(255,84,84,0.12)" : "rgba(255,255,255,0.04)",
                      color: deleteReason === reason ? "#FFB0B0" : "var(--text)",
                    }}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              {deleteError && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12,
                  background: "var(--danger-bg)", color: "#FFB0B0",
                  border: "1px solid rgba(255,84,84,0.25)",
                }}>{deleteError}</div>
              )}

              <div className="btn-row">
                <button className="btn small" onClick={() => setShowDeleteModal(false)} disabled={deleteBusy}>Cancel</button>
                <button
                  className="btn danger small"
                  onClick={handleDelete}
                  disabled={deleteBusy || !deleteReason}
                >
                  {deleteBusy ? <><span className="spinner" /> Deleting…</> : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
