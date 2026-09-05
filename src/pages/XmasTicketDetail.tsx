import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProfile } from "../lib/auth";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  return res.json();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function XmasTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profile = getProfile();

  const [ticket, setTicket] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Comment form
  const [commentAuthor, setCommentAuthor] = useState(profile?.name || "");
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  // Additional photo
  const [attachPhoto, setAttachPhoto] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [attachNote, setAttachNote] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const attachRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => { if (id) void load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/xmas-get-ticket?id=${id}`);
      setTicket(res.ticket || null);
      setPhotos(res.photos || []);
      setComments(res.comments || []);
    } finally { setLoading(false); }
  }

  async function toggleStatus() {
    if (!ticket) return;
    setBusy(true);
    const newStatus = ticket.status === "fixed" ? "open" : "fixed";
    try {
      await apiFetch("/api/xmas-update-status", {
        method: "POST",
        body: JSON.stringify({ id: ticket.id, status: newStatus }),
      });
      setTicket({ ...ticket, status: newStatus });
    } finally { setBusy(false); }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    setCommentError(null);
    if (!commentAuthor.trim()) return setCommentError("Name is required");
    if (!commentBody.trim()) return setCommentError("Comment is required");
    setBusy(true);
    try {
      const res = await apiFetch("/api/xmas-add-comment", {
        method: "POST",
        body: JSON.stringify({ ticket_id: Number(id), author: commentAuthor.trim(), body: commentBody.trim() }),
      });
      if (res.ok) {
        setComments(prev => [...prev, res.comment]);
        setCommentBody("");
      } else throw new Error(res.error || "Failed");
    } catch (err: any) {
      setCommentError(err?.message || "Failed to add comment");
    } finally { setBusy(false); }
  }

  async function submitAttachPhoto(e: React.FormEvent) {
    e.preventDefault();
    if (!attachPhoto) return;
    setAttachBusy(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(attachPhoto);
      });
      const res = await apiFetch("/api/xmas-attach-photo", {
        method: "POST",
        body: JSON.stringify({
          ticket_id: Number(id),
          photoBase64: base64,
          photoFilename: attachPhoto.name,
          note: attachNote.trim(),
          author: commentAuthor || profile?.name || "Staff",
        }),
      });
      if (res.ok) {
        setAttachPhoto(null);
        setAttachPreview(null);
        setAttachNote("");
        await load();
      }
    } finally { setAttachBusy(false); }
  }

  if (loading) return (
    <div className="page fade-up" style={{ textAlign: "center", paddingTop: 60 }}>
      <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  );

  if (!ticket) return (
    <div className="page fade-up">
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "var(--muted)" }}>Ticket not found.</div>
      </div>
    </div>
  );

  const isFixed = ticket.status === "fixed";

  return (
    <div className="page fade-up">
      <div className="back-link" onClick={() => navigate("/christmas")} style={{ cursor: "pointer" }}>
        ← Christmas Tickets
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div className="page-title">#{ticket.id} — {ticket.location_friendly}</div>
          <div className="page-subtitle">By {ticket.tech_name} · {fmtDate(ticket.created_at)}</div>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 99,
          background: isFixed ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
          color: isFixed ? "#34d399" : "#f87171",
          border: `1px solid ${isFixed ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
          flexShrink: 0, alignSelf: "flex-start",
        }}>
          {isFixed ? "✓ Fixed" : "Open"}
        </span>
      </div>

      {/* Description */}
      <div className="card" style={{ padding: 16, marginBottom: 10 }}>
        <div className="detail-label">Description</div>
        <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, marginTop: 4, whiteSpace: "pre-wrap" }}>
          {ticket.description}
        </div>
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 10 }}>
          <div className="detail-label" style={{ marginBottom: 10 }}>Photos</div>
          <div className="photos-grid">
            {photos.map((p: any, i: number) => (
              <a key={i} href={p.photo_url} target="_blank" rel="noreferrer" className="photo-item">
                <img src={p.photo_url} alt={`Photo ${i + 1}`} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Toggle status */}
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button
          className={`btn${isFixed ? "" : " primary"}`}
          onClick={toggleStatus}
          disabled={busy}
          style={isFixed ? { borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.1)", color: "#f87171" } : {}}
        >
          {busy ? <span className="spinner" /> : isFixed ? "↩ Reopen" : "✓ Mark Fixed"}
        </button>
      </div>

      {/* Attach additional photo */}
      <div className="card" style={{ padding: 16, marginBottom: 10 }}>
        <div className="detail-label" style={{ marginBottom: 10 }}>Add Photo Update</div>
        <form onSubmit={submitAttachPhoto}>
          {attachPreview ? (
            <div style={{ position: "relative", marginBottom: 10 }}>
              <img src={attachPreview} alt="Preview" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
              <button type="button" onClick={() => { setAttachPhoto(null); setAttachPreview(null); if (attachRef.current) attachRef.current.value = ""; }}
                style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", color: "#fff", fontSize: 14 }}>×</button>
            </div>
          ) : (
            <button type="button" onClick={() => attachRef.current?.click()} className="btn small" style={{ width: "100%", marginBottom: 10, justifyContent: "center" }}>
              📷 Choose photo
            </button>
          )}
          <input ref={attachRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (!f) return; setAttachPhoto(f); const r = new FileReader(); r.onload = ev => setAttachPreview(ev.target?.result as string); r.readAsDataURL(f); }} />

          {attachPhoto && (
            <>
              <textarea className="textarea" value={attachNote} onChange={e => setAttachNote(e.target.value)}
                placeholder="Optional note about this update…" style={{ minHeight: 60, marginBottom: 8 }} />
              <button type="submit" disabled={attachBusy} className="btn primary small" style={{ width: "100%" }}>
                {attachBusy ? <span className="spinner" /> : "Upload Photo"}
              </button>
            </>
          )}
        </form>
      </div>

      {/* Comments */}
      <div className="card" style={{ padding: 16, marginBottom: 10 }}>
        <div className="detail-label" style={{ marginBottom: 10 }}>
          Updates {comments.length > 0 && `(${comments.length})`}
        </div>

        {comments.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>No updates yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {comments.map((c: any) => (
              <div key={c.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{c.author}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.body}</div>
                <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4 }}>{fmtDate(c.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submitComment}>
          <div className="field-label">Add Update</div>
          <input className="input" value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)}
            placeholder="Your name" style={{ marginBottom: 8 }} />
          <textarea className="textarea" value={commentBody} onChange={e => setCommentBody(e.target.value)}
            placeholder="What was done, what still needs attention…" style={{ minHeight: 70, marginBottom: 8 }} />
          {commentError && <div style={{ fontSize: 12, color: "#FFB0B0", marginBottom: 8 }}>⚠ {commentError}</div>}
          <button type="submit" disabled={busy} className="btn primary small" style={{ width: "100%" }}>
            {busy ? <span className="spinner" /> : "Post Update"}
          </button>
        </form>
      </div>
    </div>
  );
}
