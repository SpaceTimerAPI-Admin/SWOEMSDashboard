import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addProjectComment, closeProject, confirmProjectPhoto, getProject, getProjectPhotoUploadUrl } from "../lib/api";

function fmtDays(ms: number) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / (24 * 60 * 60 * 1000));
  if (d <= 0) return "today";
  return `${d}d`;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const res = await getProject(String(id));
      setData(res);
    } catch (e: any) {
      setErr(e.message || "Failed to load project");
    }
  }

  useEffect(() => { load(); }, [id]);

  const dueInfo = useMemo(() => {
    if (!data?.project?.sla_due_at) return null;
    const due = new Date(data.project.sla_due_at).getTime();
    const ms = due - Date.now();
    return { ms, overdue: ms < 0 };
  }, [data]);

  async function onAddComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await addProjectComment({ project_id: String(id), comment: comment.trim() });
      setComment("");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to add comment");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadPhoto(file: File) {
    setUploadErr(null);
    setUploading(true);
    try {
      const up = await getProjectPhotoUploadUrl({
        project_id: String(id),
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
      });

      const putRes = await fetch(up.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      const putText = await putRes.text().catch(() => "");
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status} ${putText}`);

      await confirmProjectPhoto({ project_id: String(id), storage_path: up.storage_path });
      await load();
    } catch (e: any) {
      setUploadErr(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onClose() {
    setBusy(true);
    try {
      await closeProject({ id: String(id) });
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to close");
    } finally {
      setBusy(false);
    }
  }

  const p = data?.project;
  const comments = data?.comments || [];
  const photos = data?.photos || [];

  return (
    <div className="container">
      <div className="row" style={{alignItems:"center"}}>
        <div className="col">
          <div className="h1">Project</div>
          <div className="muted"><Link to="/projects">Back to projects</Link></div>
        </div>
      </div>

      {err ? <div style={{marginTop:10,color:"#ff8b8b"}}>{err}</div> : null}

      {p ? (
        <>
          <div className="card" style={{marginTop:12}}>
            <div className="h2">{p.title}</div>
            <div className="muted">Location: {p.location}</div>
            <div className="muted">Created by {p.created_by_name} • {new Date(p.created_at).toLocaleString()}</div>
            <div style={{marginTop:8}}>
              <span className="muted">Status: </span><b>{p.status}</b>
            </div>
            <div style={{marginTop:6}}>
              <span className="muted">SLA Due: </span>{new Date(p.sla_due_at).toLocaleString()}
              {dueInfo ? (
                <span style={{marginLeft:10, fontWeight:700, color: dueInfo.overdue ? "#ff8b8b" : "#b7c2ff"}}>
                  {dueInfo.overdue ? `Overdue by ${fmtDays(dueInfo.ms)}` : `Due in ${fmtDays(dueInfo.ms)}`}
                </span>
              ) : null}
            </div>
            {p.source_ticket_id ? <div className="muted" style={{marginTop:6}}>Converted from ticket: {p.source_ticket_id}</div> : null}
            <div style={{marginTop:10}}>{p.details}</div>

            <div className="row" style={{marginTop:12}}>
              <div className="col">
                <button className="btn danger" onClick={onClose} disabled={busy || p.status === "closed"}>
                  {p.status === "closed" ? "Closed" : "Close Project"}
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="h2">Photos</div>
            {uploadErr ? <div style={{marginTop:10,color:"#ff8b8b"}}>{uploadErr}</div> : null}
            <div className="row" style={{marginTop:10, alignItems:"center"}}>
              <div className="col">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadPhoto(f);
                    e.currentTarget.value = "";
                  }}
                  disabled={uploading}
                />
              </div>
              <div className="col" style={{textAlign:"right"}}>
                <span className="muted">{uploading ? "Uploading..." : "Optional"}</span>
              </div>
            </div>

            {photos.length ? (
              <div style={{marginTop:12, display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10}}>
                {photos.map((ph: any) => (
                  <a key={ph.id} href={ph.public_url} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
                    <div style={{border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, overflow:"hidden"}}>
                      <img src={ph.public_url} alt="project" style={{width:"100%", height:160, objectFit:"cover", display:"block"}} />
                      <div style={{padding:8}} className="muted">
                        {ph.uploaded_by_name} • {new Date(ph.created_at).toLocaleString()}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="muted" style={{marginTop:10}}>No photos yet.</div>
            )}
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="h2">Updates</div>
            {comments.length ? (
              <div style={{display:"grid", gap:10}}>
                {comments.map((c: any) => (
                  <div key={c.id} style={{padding:10, borderRadius:12, border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div className="muted">{c.employee_name} • {new Date(c.created_at).toLocaleString()}</div>
                    <div style={{marginTop:6}}>{c.comment}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No updates yet.</div>
            )}

            <label style={{marginTop:12}}>Add update</label>
            <textarea className="input" style={{minHeight:90}} value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="What changed?" />
            <div style={{marginTop:10}}>
              <button className="btn" onClick={onAddComment} disabled={busy || !comment.trim()}>
                {busy ? "Saving..." : "Add update"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{marginTop:12}}><div className="muted">Loading...</div></div>
      )}

      <div className="spacer" />
    </div>
  );
}
