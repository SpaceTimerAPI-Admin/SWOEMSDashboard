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

export default function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const ticketId = id || "";

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await getTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to load ticket");
      setTicket(res?.ticket || res?.data?.ticket || res?.data || null);
    } catch (e: any) {
      setError(e?.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (ticketId) void load(); }, [ticketId]);

  const photos = useMemo(() => {
    const arr = ticket?.photos || ticket?.photo_urls || ticket?.photoUrls || [];
    return Array.isArray(arr) ? arr : [];
  }, [ticket]);

  async function handleAddComment(photoKeys?: string[]) {
    setCommentError(null);
    const c = comment.trim();
    if (!c && (!photoKeys || photoKeys.length === 0)) {
      setCommentError("Comment or photo required.");
      return;
    }

    setBusy(true);
    try {
      const res: any = await addTicketComment({
        id: ticketId,
        comment: c,
        photo_keys: photoKeys || [],
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
    if (!ticketId) return;
    setBusy(true);
    try {
      const res: any = await closeTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to close ticket");
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to close ticket");
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
      const projectId = res?.project_id || res?.data?.project_id;
      if (projectId) nav(`/projects/${projectId}`);
      else nav("/projects");
    } catch (e: any) {
      alert(e?.message || "Failed to convert");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File): Promise<string> {
    // returns storage_key
    const res: any = await getTicketPhotoUploadUrl({
      ticket_id: ticketId,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
    });
    if (!res?.ok) throw new Error(res?.error || "Failed to get upload URL");

    const uploadUrl = res?.upload_url || res?.data?.upload_url;
    const storageKey = res?.storage_key || res?.data?.storage_key;

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
    });
    if (!conf?.ok) throw new Error(conf?.error || "Confirm failed");

    return storageKey;
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    setBusy(true);
    try {
      const keys: string[] = [];
      for (const f of files) keys.push(await uploadPhoto(f));
      // add as a comment (optional)
      await handleAddComment(keys);
    } catch (err: any) {
      alert(err?.message || "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="row between">
        <Link className="btn" to="/tickets">← Back</Link>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={handleConvertToProject} disabled={busy}>Move to project</button>
          <button className="btn" onClick={handleClose} disabled={busy}>Close</button>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="error">{error}</div>}

      {!loading && ticket && (
        <>
          <h1 style={{ marginTop: 12 }}>{ticket.title}</h1>
          <div className="muted">{ticket.location}</div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Update / Comment</h2>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} />
            <div className="row between" style={{ marginTop: 8 }}>
              <label className="btn">
                Upload photo
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickFiles} />
              </label>
              <button className="btn primary" disabled={busy} onClick={() => handleAddComment()}>
                {busy ? "Saving..." : "Add comment"}
              </button>
            </div>
            {commentError && <div className="error" style={{ marginTop: 8 }}>{commentError}</div>}
          </div>

          {photos.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Photos</h2>
              <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                {photos.map((p: any, idx: number) => (
                  <a key={idx} href={p.url || p} target="_blank" rel="noreferrer">
                    <img src={p.url || p} style={{ width: "100%", borderRadius: 12 }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <h2>History</h2>
            <div className="list">
              {(ticket.comments || ticket.history || []).map((c: any, idx: number) => (
                <div key={idx} className="list-item">
                  <div className="title">{c.comment || c.text || c.message}</div>
                  <div className="meta">{c.created_at || c.createdAt || ""}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
