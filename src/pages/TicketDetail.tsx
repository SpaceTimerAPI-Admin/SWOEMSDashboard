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
  // Supports ApiResult<{...}> ({ok:true,data:{...}}) and legacy ({ok:true, ...})
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
      const t = data?.ticket || data; // some versions return {ticket, comments, photos}
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

  useEffect(() => {
    if (ticketId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const photos = useMemo(() => {
    const arr = ticket?.photos || [];
    return Array.isArray(arr) ? arr : [];
  }, [ticket]);

  async function handleAddComment() {
    setCommentError(null);
    const c = comment.trim();
    if (!c) {
      setCommentError("Comment required.");
      return;
    }

    setBusy(true);
    try {
      const res: any = await addTicketComment({
        ticket_id: ticketId,
        id: ticketId, // support older handlers too
        comment: c,
      });
      if (!res?.ok) throw new Error(res?.error || "Failed to add comment");
      setComment("");
      await load();
    } catch (e: any) {
      setCommentError(e?.message || "Failed to add comment");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    // open resolution modal
    setResolutionError(null);
    setResolution("");
    setShowCloseModal(true);
  }

  async function confirmClose() {
    if (!ticketId) return;
    const trimmed = resolution.trim();
    if (!trimmed) {
      setResolutionError("Please enter a resolution note.");
      return;
    }
    setBusy(true);
    try {
      // add resolution into history before closing
      await addTicketComment(ticketId, `Resolution: ${trimmed}`);
      const res: any = await closeTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to close ticket");
      setShowCloseModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }

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
    } catch (e: any) {
      alert(e?.message || "Failed to convert");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File): Promise<void> {
    const safeName = (file && file.name && file.name.trim()) ? file.name : `photo_${Date.now()}.jpg`;

    const res: any = await getTicketPhotoUploadUrl({
      ticket_id: ticketId,
      filename: safeName,
      file_name: safeName, // support older handlers
      content_type: file.type || "application/octet-stream",
    });
    if (!res?.ok) throw new Error(res?.error || "Failed to get upload URL");

    const data: any = pickData(res);
    const uploadUrl = data?.upload_url;
    const storageKey = data?.storage_key || data?.storage_path;

    if (!uploadUrl || !storageKey) throw new Error("Upload URL missing");

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) throw new Error("Upload failed");

    const conf: any = await confirmTicketPhoto({
      ticket_id: ticketId,
      storage_key: storageKey,
      storage_path: storageKey,
    });
    if (!conf?.ok) throw new Error(conf?.error || "Confirm failed");
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    setBusy(true);
    try {
      for (const f of files) await uploadPhoto(f);
      // No comment required for photos. Just reload so they appear.
      await load();
    } catch (err: any) {
      alert(err?.message || "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  const history = useMemo(() => {
    const arr = ticket?.comments || ticket?.history || [];
    return Array.isArray(arr) ? arr : [];
  }, [ticket]);

  return (
    <div className="page">
      <div className="row between">
        <Link className="btn" to="/tickets">← Back</Link>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={handleConvertToProject} disabled={busy}>Move to project</button>
          <button className="btn" onClick={handleClose} disabled={busy}>Close ticket</button>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="error">{error}</div>}

      {!loading && ticket && (
        <>
          <div className="row between" style={{ marginTop: 12, alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>{ticket.title}</h1>
            <div className={"pill sm " + (ticket.status === "open" ? "primary" : "neutral")}>
              {ticket.status === "open" ? "OPEN" : "CLOSED"}
            </div>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {ticket.location}
            {ticket.tag ? <span className="dot">•</span> : null}
            {ticket.tag ? <span>{ticket.tag}</span> : null}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Update / Comment</h2>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add an update, note, or status change…"
              rows={4}
            />
            <div className="row between" style={{ marginTop: 8, gap: 12 }}>
              <label className="btn">
                Add photos
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickFiles} />
              </label>
              <button className="btn primary" disabled={busy} onClick={handleAddComment}>
                {busy ? "Saving..." : "Add comment"}
              </button>
            </div>
            {commentError && <div className="error" style={{ marginTop: 8 }}>{commentError}</div>}
          </div>

          {photos.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Photos</h2>
              <div className="photos-grid">
                {photos.map((p: any, idx: number) => {
                  const url = p?.public_url || p?.url || p;
                  if (!url) return null;
                  return (
                    <a key={idx} href={url} target="_blank" rel="noreferrer">
                      <img src={url} />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <div className="row between" style={{ alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>History</h2>
              <span className="badge">{history.length}</span>
            </div>
            <div className="list" style={{ marginTop: 10 }}>
              {history.length === 0 && <div className="muted">No updates yet.</div>}
              {history.map((c: any, idx: number) => (
                <div key={idx} className="list-item">
                  <div className="title">{c.comment || c.text || c.message}</div>
                  <div className="meta">
                    {(c.employee_name || c.employees?.name || "").toString()} {c.created_at ? "• " + new Date(c.created_at).toLocaleString() : ""}
                  </div>
                </div>
              ))}
            </div>
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
              <div className="field-label">Resolution</div>
              <textarea
                className="textarea"
                value={resolution}
                onChange={(e) => {
                  setResolution(e.target.value);
                  setResolutionError(null);
                }}
                placeholder="What fixed it? What was done? Any follow-up?"
              />
              {resolutionError && <div className="error" style={{ marginTop: 10 }}>{resolutionError}</div>}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn small" type="button" onClick={() => setShowCloseModal(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn primary small" type="button" onClick={confirmClose} disabled={busy}>
                  Close ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}