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

function fmtDate(d?: string): string {
  if (!d) return "";
  const ms = Date.parse(d);
  if (!ms) return d;
  return new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

function humanMs(ms: number): string {
  const a = Math.abs(ms);
  const mins = Math.round(a / 60000);
  if (mins < 1) return "seconds";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

function slaBadge(t: any): { cls: string; text: string } {
  const status = (t?.status || "").toString().toLowerCase();
  if (status === "closed") return { cls: "neutral", text: "Closed" };
  if (status === "project") return { cls: "neutral", text: "Converted" };

  const msLeft = typeof t?.ms_left === "number" ? t.ms_left : (t?.sla_due_at ? Date.parse(t.sla_due_at) - Date.now() : NaN);
  if (!isFinite(msLeft)) return { cls: "neutral", text: "No SLA" };

  if (msLeft < 0) return { cls: "bad", text: `Overdue ${humanMs(msLeft)}` };
  if (msLeft <= 15 * 60 * 1000) return { cls: "warn", text: `Due ${humanMs(msLeft)}` };
  return { cls: "good", text: `Due ${humanMs(msLeft)}` };
}

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
      const d: any = res?.data ?? res;
      const t = d?.ticket ?? d?.data?.ticket ?? d?.data ?? d?.ticket;
      if (!t) throw new Error("Not found");
      setTicket({ ...t, comments: d?.comments ?? t.comments, photos: d?.photos ?? t.photos });
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

  const isClosed = ((ticket?.status || "").toString().toLowerCase() === "closed") || !!ticket?.closed_at;

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
      // Photo uploads should not require a typed comment.
      if (comment.trim()) {
        await handleAddComment();
      } else {
        await load();
      }
    } catch (err: any) {
      alert(err?.message || "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  const sla = ticket ? slaBadge(ticket) : { cls: "neutral", text: "—" };

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 10 }}>
        <Link className="btn inline ghost" to="/tickets">← Back</Link>

        <div className="row wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
          {!isClosed && (
            <button className="btn inline" onClick={handleConvertToProject} disabled={busy}>
              Move to project
            </button>
          )}
          {!isClosed && (
            <button className="btn inline danger" onClick={handleClose} disabled={busy}>
              Close
            </button>
          )}
        </div>
      </div>

      {loading && <div className="muted" style={{ marginTop: 14 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}

      {!loading && ticket && (
        <>
          <div style={{ marginTop: 12 }}>
            <div className="row between wrap" style={{ gap: 10, alignItems: "flex-start" }}>
              <div className="grow">
                <h1 style={{ marginBottom: 8 }}>{ticket.title || "Ticket"}</h1>
                <div className="muted">{ticket.location || "No location"}</div>
              </div>
              <div className="badges">
                <span className={"badge " + sla.cls}>{sla.text}</span>
                <span className="badge">{(ticket.status || "open").toString().toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="kv">
              <div className="cell">
                <div className="k">Created</div>
                <div className="v">{fmtDate(ticket.created_at)}</div>
              </div>
              <div className="cell">
                <div className="k">SLA Due</div>
                <div className="v">{ticket.sla_due_at ? fmtDate(ticket.sla_due_at) : "—"}</div>
              </div>
              <div className="cell">
                <div className="k">Created By</div>
                <div className="v">{ticket.created_by_name || ticket.created_by || "—"}</div>
              </div>
              <div className="cell">
                <div className="k">SLA</div>
                <div className="v">{ticket.sla_minutes ? `${ticket.sla_minutes} min` : "—"}</div>
              </div>
            </div>

            {ticket.details && (
              <div style={{ marginTop: 12 }}>
                <div className="k" style={{ fontSize: 12, color: "rgba(230,232,239,0.70)" }}>Details</div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{ticket.details}</div>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-title">
              <h2 style={{ margin: 0 }}>Update / Comment</h2>
              <span className="badge neutral">{busy ? "Saving…" : "Ready"}</span>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Add an update, note, or status change…"
              style={{ marginTop: 10 }}
            />

            <div className="row between wrap" style={{ marginTop: 10, gap: 10 }}>
              <label className="btn inline secondary" style={{ cursor: busy ? "not-allowed" : "pointer" }}>
                Add photos
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickFiles} disabled={busy} />
              </label>

              <button className="btn inline" disabled={busy} onClick={() => handleAddComment()}>
                Add comment
              </button>
            </div>

            {commentError && <div className="error">{commentError}</div>}
          </div>

          {photos.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="section-title">
                <h2 style={{ margin: 0 }}>Photos</h2>
                <span className="badge neutral">{photos.length}</span>
              </div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                {photos.map((p: any, idx: number) => (
                  <a key={idx} href={p.url || p} target="_blank" rel="noreferrer">
                    <img src={p.url || p} style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)" }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-title">
              <h2 style={{ margin: 0 }}>History</h2>
              <span className="badge neutral">{(ticket.comments || ticket.history || []).length}</span>
            </div>

            <div className="list" style={{ marginTop: 12 }}>
              {(ticket.comments || ticket.history || []).map((c: any, idx: number) => (
                <div key={idx} className="list-item">
                  <div className="title" style={{ fontSize: 16 }}>{c.comment || c.text || c.message || "Update"}</div>
                  <div className="meta">{fmtDate(c.created_at || c.createdAt)} {c.created_by_name ? `• ${c.created_by_name}` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="spacer" />
    </div>
  );
}
