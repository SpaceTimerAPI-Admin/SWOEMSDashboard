import React, { useEffect, useState } from "react";
import { adminListUsers, adminCreateUser, adminUpdateUser } from "../lib/api";

const ROLES = ["ems", "show_tech", "admin"] as const;
const ROLE_LABELS: Record<string, string> = { ems: "EMS", show_tech: "Show Tech", admin: "Admin" };
const ROLE_COLORS: Record<string, string> = {
  admin: "rgba(255,182,39,0.15)",
  ems: "rgba(92,107,255,0.15)",
  show_tech: "rgba(46,232,160,0.12)",
};
const ROLE_TEXT: Record<string, string> = { admin: "#FFD07A", ems: "#B0B8FF", show_tech: "#7EEFC4" };

function fmtDate(iso: string) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export default function Admin() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"users" | "create">("users");
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  // Create form
  const [form, setForm] = useState({ employee_id: "", name: "", email: "", pin: "", role: "ems" });

  // Edit form
  const [editForm, setEditForm] = useState<any>({});

  async function loadUsers() {
    setLoading(true);
    try {
      const res: any = await adminListUsers();
      if (res?.ok) setEmployees((res.data ?? res).employees || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    setBusy(true);
    try {
      const res: any = await adminCreateUser(form as any);
      if (!res?.ok) throw new Error(res?.error || "Failed");
      setStatusMsg({ ok: true, msg: `✓ Account created for ${form.name}` });
      setForm({ employee_id: "", name: "", email: "", pin: "", role: "ems" });
      await loadUsers();
      setView("users");
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message || "Failed to create" });
    } finally { setBusy(false); }
  }

  async function handleUpdate(id: string, changes: any) {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res: any = await adminUpdateUser({ id, ...changes });
      if (!res?.ok) throw new Error(res?.error || "Failed");
      setStatusMsg({ ok: true, msg: "✓ Updated" });
      setEditTarget(null);
      await loadUsers();
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message || "Failed" });
    } finally { setBusy(false); }
  }

  function openEdit(emp: any) {
    setEditTarget(emp);
    setEditForm({ name: emp.name, email: emp.email, role: emp.role, pin: "" });
    setStatusMsg(null);
  }

  return (
    <div className="page fade-up" style={{ paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="page-title">Admin</div>
          <div className="page-subtitle">User Management</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setView("users"); setStatusMsg(null); }}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: view === "users" ? "rgba(92,107,255,0.15)" : "rgba(255,255,255,0.05)",
              color: view === "users" ? "#B0B8FF" : "var(--muted)" }}>
            Users
          </button>
          <button onClick={() => { setView("create"); setStatusMsg(null); }}
            className="btn primary" style={{ fontSize: 13 }}>
            + Create Account
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{ marginBottom: 12, padding: "10px 13px", borderRadius: 10, fontSize: 13,
          background: statusMsg.ok ? "var(--success-bg)" : "var(--danger-bg)",
          color: statusMsg.ok ? "#7EEFC4" : "#FFB0B0",
          border: `1px solid ${statusMsg.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}` }}>
          {statusMsg.msg}
        </div>
      )}

      {/* CREATE FORM */}
      {view === "create" && (
        <div className="card" style={{ padding: "18px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>New Account</div>
          <form onSubmit={handleCreate}>
            <label><div className="field-label">Full Name</div>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Alex Johnson" /></label>
            <label style={{ marginTop: 8 }}><div className="field-label">Employee ID</div>
              <input className="input" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} placeholder="12345" inputMode="numeric" /></label>
            <label style={{ marginTop: 8 }}><div className="field-label">Email</div>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@seaworld.com" /></label>
            <label style={{ marginTop: 8 }}><div className="field-label">PIN (4 digits)</div>
              <input className="input" type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} placeholder="••••" /></label>
            <div style={{ marginTop: 8 }}>
              <div className="field-label">Role</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {ROLES.map(r => (
                  <button key={r} type="button"
                    onClick={() => setForm(f => ({ ...f, role: r }))}
                    style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "1px solid",
                      borderColor: form.role === r ? ROLE_TEXT[r] + "66" : "var(--border)",
                      background: form.role === r ? ROLE_COLORS[r] : "rgba(255,255,255,0.04)",
                      color: form.role === r ? ROLE_TEXT[r] : "var(--muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn primary full" style={{ marginTop: 16 }} type="submit" disabled={busy}>
              {busy ? <><span className="spinner" /> Creating…</> : "Create Account"}
            </button>
          </form>
        </div>
      )}

      {/* USERS LIST */}
      {view === "users" && (
        <div>
          {loading ? (
            <div className="card" style={{ padding: "24px", textAlign: "center" }}>
              <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {employees.map(emp => (
                <div key={emp.id} className="card" style={{ padding: "14px 16px", opacity: emp.is_active ? 1 : 0.55 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{emp.name}</span>
                        <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 99, fontWeight: 600,
                          background: ROLE_COLORS[emp.role] || ROLE_COLORS.ems,
                          color: ROLE_TEXT[emp.role] || ROLE_TEXT.ems }}>
                          {ROLE_LABELS[emp.role] || emp.role}
                        </span>
                        {!emp.is_active && (
                          <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 99, fontWeight: 600,
                            background: "rgba(255,84,84,0.12)", color: "#FFB0B0" }}>Inactive</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>
                        ID #{emp.employee_id} · {emp.email}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                        Last login: {fmtDate(emp.last_login_at)}
                      </div>
                    </div>
                    <button onClick={() => openEdit(emp)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.05)", color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EDIT MODAL */}
      {editTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditTarget(null); }}>
          <div className="card modal-card" style={{ maxWidth: 400, width: "100%" }}>
            <div className="modal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="modal-title">Edit — {editTarget.name}</h3>
              <button onClick={() => setEditTarget(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">
              <label><div className="field-label">Name</div>
                <input className="input" value={editForm.name} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} /></label>
              <label style={{ marginTop: 8 }}><div className="field-label">Email</div>
                <input className="input" type="email" value={editForm.email} onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))} /></label>
              <label style={{ marginTop: 8 }}><div className="field-label">New PIN (leave blank to keep)</div>
                <input className="input" type="password" inputMode="numeric" maxLength={4} value={editForm.pin} onChange={e => setEditForm((f: any) => ({ ...f, pin: e.target.value }))} placeholder="••••" /></label>
              <div style={{ marginTop: 8 }}>
                <div className="field-label">Role</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {ROLES.map(r => (
                    <button key={r} type="button"
                      onClick={() => setEditForm((f: any) => ({ ...f, role: r }))}
                      style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: "1px solid",
                        borderColor: editForm.role === r ? ROLE_TEXT[r] + "66" : "var(--border)",
                        background: editForm.role === r ? ROLE_COLORS[r] : "rgba(255,255,255,0.04)",
                        color: editForm.role === r ? ROLE_TEXT[r] : "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "space-between" }}>
                <button
                  onClick={() => handleUpdate(editTarget.id, { is_active: !editTarget.is_active })}
                  disabled={busy}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid",
                    borderColor: editTarget.is_active ? "rgba(255,84,84,0.3)" : "rgba(46,232,160,0.3)",
                    background: editTarget.is_active ? "rgba(255,84,84,0.1)" : "rgba(46,232,160,0.1)",
                    color: editTarget.is_active ? "#FFB0B0" : "#7EEFC4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {editTarget.is_active ? "Deactivate" : "Reactivate"}
                </button>
                <button className="btn primary"
                  disabled={busy}
                  onClick={() => {
                    const changes: any = { name: editForm.name, email: editForm.email, role: editForm.role };
                    if (editForm.pin) changes.pin = editForm.pin;
                    handleUpdate(editTarget.id, changes);
                  }}>
                  {busy ? <><span className="spinner" /> Saving…</> : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
