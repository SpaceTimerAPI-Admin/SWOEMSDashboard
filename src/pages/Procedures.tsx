import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listProcedures, deleteProcedure } from "../lib/api";
import { getRole } from "../lib/auth";

const CATEGORY_COLORS: Record<string, string> = {
  "A Side": "rgba(92,107,255,0.18)",
  "B Side": "rgba(255,182,39,0.15)",
};
const CATEGORY_TEXT: Record<string, string> = {
  "A Side": "#B0B8FF",
  "B Side": "#FFD07A",
};
const VIS_LABELS: Record<string, string> = {
  admin: "Admin only",
  ems: "EMS + Admin",
  everyone: "Everyone",
};

export default function Procedures() {
  const [procedures, setProcedures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const role = getRole();
  const canCreate = role === "ems" || role === "admin";
  const canDelete = role === "admin";
  const nav = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const res: any = await listProcedures();
      if (res?.ok) setProcedures((res.data ?? res).procedures || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProcedure(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch {}
    setDeleting(false);
  }

  const categories = ["All", "A Side", "B Side"];
  const filtered = filter === "All" ? procedures : procedures.filter(p => p.category === filter);

  return (
    <div className="page fade-up" style={{ paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <div className="page-title">Procedures</div>
          <div className="page-subtitle">Step-by-step guides</div>
        </div>
        {canCreate && (
          <Link to="/procedures/new" className="btn primary" style={{ fontSize: 13, padding: "8px 14px", textDecoration: "none" }}>
            + New
          </Link>
        )}
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{
            padding: "5px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: "1px solid",
            borderColor: filter === c ? "rgba(92,107,255,0.4)" : "var(--border)",
            background: filter === c ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.05)",
            color: filter === c ? "#B0B8FF" : "var(--muted)",
          }}>{c}</button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ padding: "28px", textAlign: "center" }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: "32px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>No procedures yet.</div>
          {canCreate && (
            <Link to="/procedures/new" style={{ fontSize: 13, color: "#B0B8FF", marginTop: 8, display: "block" }}>Create your first procedure →</Link>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(proc => (
            <div key={proc.id} className="card" style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => nav(`/procedures/${proc.id}`)} className="cursor-pointer">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", cursor: "pointer" }}>{proc.title}</span>
                    <span style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 99, fontWeight: 600,
                      background: CATEGORY_COLORS[proc.category] || "rgba(255,255,255,0.08)",
                      color: CATEGORY_TEXT[proc.category] || "var(--muted)",
                    }}>{proc.category}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted2)" }}>
                    {proc.step_count} step{proc.step_count !== 1 ? "s" : ""}
                    <span className="dot">•</span>
                    {VIS_LABELS[proc.visibility] || proc.visibility}
                    <span className="dot">•</span>
                    by {proc.created_by_name}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Link to={`/procedures/${proc.id}`} style={{
                    padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)",
                    background: "rgba(92,107,255,0.12)", color: "#B0B8FF",
                    fontSize: 12, fontWeight: 600, textDecoration: "none",
                  }}>View</Link>
                  {canCreate && (
                    <Link to={`/procedures/${proc.id}/edit`} style={{
                      padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.05)", color: "var(--muted)",
                      fontSize: 12, fontWeight: 600, textDecoration: "none",
                    }}>Edit</Link>
                  )}
                  {canDelete && (
                    <button onClick={() => setDeleteTarget(proc)} style={{
                      padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,84,84,0.25)",
                      background: "rgba(255,84,84,0.1)", color: "#FFB0B0",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>🗑</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="card modal-card" style={{ maxWidth: 380 }}>
            <div className="modal-head"><h3 className="modal-title">Delete Procedure?</h3></div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
                This will permanently delete <strong style={{ color: "var(--text)" }}>{deleteTarget.title}</strong> and all its steps.
              </p>
              <div className="btn-row">
                <button className="btn small" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
                <button className="btn danger small" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <span className="spinner" /> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
