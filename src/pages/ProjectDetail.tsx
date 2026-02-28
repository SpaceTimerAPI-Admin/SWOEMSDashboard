import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addProjectComment,
  closeProject,
  confirmProjectPhoto,
  getProject,
  getProjectPhotoUploadUrl,
} from "../lib/api";

type Project = any;

function pickData(res: any) {
  if (!res) return null;
  if (res.ok && "data" in res) return res.data;
  return res;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const projectId = id || "";

  const [project, setProject] = useState<Project | null>(null);
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
      const res: any = await getProject(projectId);
      if (!res?.ok) throw new Error(res?.error || "Failed to load project");

      const data: any = pickData(res);
      const p = data?.project || data;
      const merged = {
        ...(p || {}),
        comments: data?.comments ?? p?.comments ?? p?.history ?? [],
        photos: data?.photos ?? p?.photos ?? p?.photo_urls ?? [],
      };
      setProject(merged);
    } catch (e: any) {
      setError(e?.message || "Failed to load project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (projectId) void load(); }, [projectId]);

  const photos = useMemo(() => {
    const arr = project?.photos || [];
    return Array.isArray(arr) ? arr : [];
  }, [project]);

  const history = useMemo(() => {
    const arr = project?.comments || project?.history || [];
    return Array.isArray(arr) ? arr : [];
  }, [project]);

  async function handleAddComment() {
    setCommentError(null);
    const c = comment.trim();
    if (!c) {
      setCommentError("Comment required.");
      return;
    }

    setBusy(true);
    try {
      const res: any = await addProjectComment({
        project_id: projectId,
        id: projectId,
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
    setResolutionError(null);
    setResolution("");
    setShowCloseModal(true);
  }

  async function confirmClose() {
    if (!projectId) return;
    const trimmed = resolution.trim();
    if (!trimmed) {
      setResolutionError("Please enter a resolution note.");
      return;
    }
    setBusy(true);
    try {
      await addProjectComment({ id: projectId, comment: `Resolution: ${trimmed}` });
      const res: any = await closeProject(projectId);
      if (!res?.ok) throw new Error(res?.error || "Failed to close project");
      setShowCloseModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }

  }

  async function uploadPhoto(file: File): Promise<void> {
    const safeName = (file && file.name && file.name.trim()) ? file.name : `photo_${Date.now()}.jpg`;

    const res: any = await getProjectPhotoUploadUrl({
      project_id: projectId,
      filename: safeName,
      file_name: safeName,
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

    const conf: any = await confirmProjectPhoto({
      project_id: projectId,
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
      await load();
    } catch (err: any) {
      alert(err?.message || "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  const isClosed = project?.status === "closed" || project?.status === "done";

  return (
    <div className="page fade-up">
      <Link to="/projects" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Projects
      </Link>

      {loading && <div className="muted">Loading…</div>}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

      {!loading && project && (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.025em", flex: 1 }}>{project.title}</h1>
            <span className={`chip ${isClosed ? "neutral" : "success"}`} style={{ marginTop: 4 }}>
              <span className={`status-dot ${isClosed ? "closed" : "open"}`} />
              {isClosed ? "Closed" : "Open"}
            </span>
          </div>

          <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
            {project.location}
            {project.tag ? <><span className="dot">•</span><span>{project.tag}</span></> : null}
          </div>

          {!isClosed && (
            <div className="btn-row" style={{ marginBottom: 16 }}>
              <button className="btn small danger" onClick={handleClose} disabled={busy}>Close project</button>
            </div>
          )}

          {project.details && (
            <div className="card" style={{ padding: "14px 15px", marginBottom: 10 }}>
              <div className="detail-label">Details</div>
              <div className="prewrap detail-value" style={{ marginTop: 4 }}>{project.details}</div>
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
              <div key={idx} style={{ padding: "10px 0", borderTop: idx === 0 ? "none" : "1px solid var(--border)" }}>
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
              <h3 className="modal-title">Close project</h3>
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
                placeholder="What’s the outcome? Any next steps?"
              />
              {resolutionError && <div className="error" style={{ marginTop: 10 }}>{resolutionError}</div>}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn small" type="button" onClick={() => setShowCloseModal(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn primary small" type="button" onClick={confirmClose} disabled={busy}>
                  Close project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}