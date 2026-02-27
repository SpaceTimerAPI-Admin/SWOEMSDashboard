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
    if (!projectId) return;
    setBusy(true);
    try {
      const res: any = await closeProject(projectId);
      if (!res?.ok) throw new Error(res?.error || "Failed to close project");
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to close project");
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

  return (
    <div className="container">
      <div className="detailHeader">
        <Link className="btnGhost" to="/projects">← Back</Link>
        <div className="detailActions">
          <button className="btnPrimary" onClick={handleClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="error">{error}</div>}

      {!loading && project && (
        <>
          <div className="pageTitle" style={{ marginTop: 12 }}>{project.title}</div>
          <div className="pageSubtitle">{project.location}</div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="sectionTitle">Update / Comment</div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add an update, note, or status change…"
              rows={4}
            />
            <div className="detailActions" style={{ marginTop: 10 }}>
              <label className="btnSecondary" style={{ cursor: busy ? "not-allowed" : "pointer" }}>
                Add photos
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickFiles} />
              </label>
              <button className="btnPrimary" disabled={busy} onClick={handleAddComment}>
                {busy ? "Saving..." : "Add comment"}
              </button>
            </div>
            {commentError && <div className="error" style={{ marginTop: 8 }}>{commentError}</div>}
          </div>

          {photos.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="sectionTitle">Photos</div>
              <div className="photoGrid">
                {photos.map((p: any, idx: number) => {
                  const url = p?.public_url || p?.url || p;
                  if (!url) return null;
                  return (
                    <a key={idx} href={url} target="_blank" rel="noreferrer">
                      <img src={url} style={{ width: "100%", borderRadius: 12 }} />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <div className="sectionHead" style={{ marginBottom: 10 }}>
              <div className="sectionTitle" style={{ margin: 0 }}>History</div>
              <span className="countPill">{history.length}</span>
            </div>
            <div className="list">
              {history.length === 0 && <div className="muted">No updates yet.</div>}
              {history.map((c: any, idx: number) => (
                <div key={idx} className="historyItem">
                  <div style={{ fontWeight: 700 }}>{c.comment || c.text || c.message}</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {(c.employee_name || c.employees?.name || "").toString()} {c.created_at ? "• " + new Date(c.created_at).toLocaleString() : ""}
                  </div>
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
