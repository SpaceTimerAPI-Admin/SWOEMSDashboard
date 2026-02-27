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

function slaBadge(p: any): { cls: string; text: string } {
  const status = (p?.status || "").toString().toLowerCase();
  if (status === "closed") return { cls: "neutral", text: "Closed" };

  const msLeft = typeof p?.ms_left === "number" ? p.ms_left : (p?.sla_due_at ? Date.parse(p.sla_due_at) - Date.now() : NaN);
  if (!isFinite(msLeft)) return { cls: "neutral", text: "No SLA" };

  if (msLeft < 0) return { cls: "bad", text: `Overdue ${humanMs(msLeft)}` };
  if (msLeft <= 24 * 60 * 60 * 1000) return { cls: "warn", text: `Due ${humanMs(msLeft)}` };
  return { cls: "good", text: `Due ${humanMs(msLeft)}` };
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
      setProject(res?.data?.project || res?.project || res?.data || null);
    } catch (e: any) {
      setError(e?.message || "Failed to load project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (projectId) void load(); }, [projectId]);

  const photos = useMemo(() => {
    const arr = project?.photos || project?.photo_urls || project?.photoUrls || [];
    return Array.isArray(arr) ? arr : [];
  }, [project]);

  const isClosed = ((project?.status || "").toString().toLowerCase() === "closed") || !!project?.closed_at;
  const sla = project ? slaBadge(project) : { cls: "neutral", text: "—" };

  async function handleAddComment(photoKeys?: string[]) {
    setCommentError(null);
    const c = comment.trim();
    if (!c && (!photoKeys || photoKeys.length === 0)) {
      setCommentError("Comment or photo required.");
      return;
    }

    setBusy(true);
    try {
      const res: any = await addProjectComment({
        id: projectId,
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

  async function uploadPhoto(file: File): Promise<string> {
    const res: any = await getProjectPhotoUploadUrl({
      project_id: projectId,
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

    const conf: any = await confirmProjectPhoto({
      project_id: projectId,
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

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 10 }}>
        <Link className="btn inline ghost" to="/projects">← Back</Link>

        {!isClosed && (
          <button className="btn inline danger" onClick={handleClose} disabled={busy}>
            Close
          </button>
        )}
      </div>

      {loading && <div className="muted" style={{ marginTop: 14 }}>Loading…</div>}
      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}

      {!loading && project && (
        <>
          <div style={{ marginTop: 12 }}>
            <div className="row between wrap" style={{ gap: 10, alignItems: "flex-start" }}>
              <div className="grow">
                <h1 style={{ marginBottom: 8 }}>{project.title || "Project"}</h1>
                <div className="muted">{project.location || "No location"}</div>
              </div>
              <div className="badges">
                <span className={"badge " + sla.cls}>{sla.text}</span>
                <span className="badge">{(project.status || "open").toString().toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="kv">
              <div className="cell">
                <div className="k">Created</div>
                <div className="v">{fmtDate(project.created_at)}</div>
              </div>
              <div className="cell">
                <div className="k">SLA Due</div>
                <div className="v">{project.sla_due_at ? fmtDate(project.sla_due_at) : "—"}</div>
              </div>
              <div className="cell">
                <div className="k">Created By</div>
                <div className="v">{project.created_by_name || project.created_by || "—"}</div>
              </div>
              <div className="cell">
                <div className="k">SLA</div>
                <div className="v">{project.sla_days ? `${project.sla_days} days` : "—"}</div>
              </div>
            </div>

            {project.source_ticket_id && (
              <div style={{ marginTop: 12 }}>
                <span className="badge neutral">From ticket #{project.source_ticket_id}</span>
              </div>
            )}

            {project.details && (
              <div style={{ marginTop: 12 }}>
                <div className="k" style={{ fontSize: 12, color: "rgba(230,232,239,0.70)" }}>Details</div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{project.details}</div>
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
              <span className="badge neutral">{(project.comments || project.history || []).length}</span>
            </div>

            <div className="list" style={{ marginTop: 12 }}>
              {(project.comments || project.history || []).map((c: any, idx: number) => (
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
