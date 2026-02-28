import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addTicketComment,
  closeTicket,
  confirmTicketPhoto,
  convertTicketToProject,
  getTicket,
  getTicketPhotoUploadUrl,
} from "../lib/api";

type Ticket = any;

function pickData(res: any) {
  if (!res) return null;
  if (res.ok && "data" in res) return res.data;
  return res;
}

export default function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const ticketId = id || "";

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comment, setComment] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [resolution, setResolution] = useState("");
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await getTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to load ticket");
      const data: any = pickData(res);
      const t = data?.ticket || data;
      const merged = {
        ...(t || {}),
        comments: data?.comments ?? t?.comments ?? t?.history ?? [],
        photos: data?.photos ?? t?.photos ?? t?.photo_urls ?? [],
      };
      setTicket(merged);
    } catch (e: any) {
      setError(e?.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (ticketId) void load(); }, [ticketId]);

  const photos = useMemo(() => {
    const arr = ticket?.photos || [];
    return Array.isArray(arr) ? arr : [];
  }, [ticket]);

  async function handleAddComment() {
    setCommentError(null);
    const c = comment.trim();
    if (!c) { setCommentError("Comment required."); return; }
    setBusy(true);
    try {
      const res: any = await addTicketComment({ ticket_id: ticketId, id: ticketId, comment: c });
      if (!res?.ok) throw new Error(res?.error || "Failed to add comment");
      setComment("");
      await load();
    } catch (e: any) {
      setCommentError(e?.message || "Failed to add comment");
    } finally { setBusy(false); }
  }

  async function confirmClose() {
    const trimmed = resolution.trim();
    if (!trimmed) { setResolutionError("Please enter a resolution note."); return; }
    setBusy(true);
    try {
      await addTicketComment({ id: ticketId, comment: `Resolution: ${trimmed}` });
      const res: any = await closeTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to close ticket");
      setShowCloseModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setBusy(false); }
  }

  async function handleConvertToProject() {
    if (!ticketId) return;
    setBusy(true);
    try {
      const res: any = await convertTicketToProject(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to convert");
      const data: any = pickData(res);
      const projectId = data?.project_id || data?.project?.id;
      if (projectId) nav(`/projects/${projectId}`);
      else nav("/projects");
    } catch (e: any) { alert(e?.message || "Failed to convert"); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(file: File): Promise<void> {
    const safeName = (file?.name?.trim()) ? file.name : `photo_${Date.now()}.jpg`;
    const res: any = await getTicketPhotoUploadUrl({ ticket_id: ticketId, filename: safeName, file_name: safeName, content_type: file.type || "application/octet-stream" });
    if (!res?.ok) throw new Error(res?.error || "Failed to get upload URL");
    const data: any = pickData(res);
    const uploadUrl = data?.upload_url;
    const storageKey = data?.storage_key || data?.storage_path;
    if (!uploadUrl || !storageKey) throw new Error("Upload URL missing");
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!put.ok) throw new Error("Upload failed");
    const conf: any = await confirmTicketPhoto({ ticket_id: ticketId, storage_key: storageKey, storage_path: storageKey });
    if (!conf?.ok) throw new Error(conf?.error || "Confirm failed");
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    try { for (const f of files) await uploadPhoto(f); await load(); }
    catch (err: any) { alert(err?.message || "Photo upload failed"); }
    finally { setBusy(false); }
  }

  const history = useMemo(() => {
    const arr = ticket?.comments || ticket?.history || [];
    return Array.isArray(arr) ? arr : [];
  }, [ticket]);

  const isClosed = ticket?.status === "closed" || ticket?.status === "done";

  return (
    <div className="page fade-up">
      <Link to="/tickets" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Tickets
      </Link>

      {loading && <div className="muted">Loading…</div>}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

      {!loading && ticket && (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.025em", flex: 1 }}>{ticket.title}</h1>
            <span className={`chip ${isClosed ? "neutral" : "success"}`} style={{ marginTop: 4 }}>
              <span className={`status-dot ${isClosed ? "closed" : "open"}`} />
              {isClosed ? "Closed" : "Open"}
            </span>
          </div>

          <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
            {ticket.location}
            {ticket.tag ? <><span className="dot">•</span><span>{ticket.tag}</span></> : null}
          </div>

          {!isClosed && (
            <div className="btn-row" style={{ marginBottom: 16 }}>
              <button className="btn small" onClick={handleConvertToProject} disabled={busy}>Move to project</button>
              <button className="btn small danger" onClick={() => { setResolutionError(null); setResolution(""); setShowCloseModal(true); }} disabled={busy}>
                Close ticket
              </button>
            </div>
          )}

          {ticket.details && (
            <div className="card" style={{ padding: "14px 15px", marginBottom: 10 }}>
              <div className="detail-label">Details</div>
              <div className="prewrap detail-value" style={{ marginTop: 4 }}>{ticket.details}</div>
            </div>
          )}

          <div className="card" style={{ padding: "14px 15px", marginBottom: 10 }}>
            <div className="detail-label" style={{ marginBottom: 8 }}>Add Update</div>
            <textarea
              className="textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note, update, or status change…"
              rows={3}
              style={{ minHeight: 70 }}
            />
            <div className="btn-row" style={{ marginTop: 10 }}>
              <label className="btn small" style={{ cursor: "pointer" }}>
                📎 Photos
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickFiles} />
              </label>
              <button className="btn primary small" disabled={busy} onClick={handleAddComment}>
                {busy ? <span className="spinner" /> : "Add comment"}
              </button>
            </div>
            {commentError && <div className="error" style={{ marginTop: 8 }}>{commentError}</div>}
          </div>

          {photos.length > 0 && (
            <div className="card" style={{ padding: "14px 15px", marginBottom: 10 }}>
              <div className="detail-label" style={{ marginBottom: 8 }}>Photos</div>
              <div className="photos-grid">
                {photos.map((p: any, idx: number) => {
                  const url = p?.public_url || p?.url || p;
                  if (!url) return null;
                  return (
                    <a key={idx} className="photo-item" href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: "14px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="detail-label" style={{ margin: 0 }}>History</div>
              <span className="count-pill">{history.length}</span>
            </div>
            {history.length === 0 && <div className="muted">No updates yet.</div>}
            {history.map((c: any, idx: number) => (
              <div key={idx} style={{
                padding: "10px 0",
                borderTop: idx === 0 ? "none" : "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.45 }}>{c.comment || c.text || c.message}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {(c.employee_name || c.employees?.name || "").toString()}
                  {c.created_at ? <><span className="dot">•</span>{new Date(c.created_at).toLocaleString()}</> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showCloseModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="card modal-card">
            <div className="modal-head">
              <h3 className="modal-title">Close ticket</h3>
            </div>
            <div className="modal-body">
              <div className="field-label">Resolution note</div>
              <textarea
                className="textarea"
                value={resolution}
                onChange={(e) => { setResolution(e.target.value); setResolutionError(null); }}
                placeholder="What was done? Any follow-up needed?"
                style={{ minHeight: 80 }}
              />
              {resolutionError && <div className="error" style={{ marginTop: 8 }}>{resolutionError}</div>}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn small" type="button" onClick={() => setShowCloseModal(false)} disabled={busy}>Cancel</button>
                <button className="btn primary small" type="button" onClick={confirmClose} disabled={busy}>
                  {busy ? <span className="spinner" /> : "Confirm close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
