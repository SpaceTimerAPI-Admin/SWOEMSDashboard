import React, { useEffect, useState } from "react";
import { logout, getProfile, setProfile } from "../lib/auth";
import { updateEmail } from "../lib/api";

export default function Settings() {
  const profile = getProfile();

  const [email, setEmail] = useState(profile?.email || "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Keep input in sync if profile loads after mount
  useEffect(() => {
    if (profile?.email && !email) setEmail(profile.email);
  }, []);

  async function onSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailStatus(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setEmailStatus({ ok: false, msg: "Email is required." }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailStatus({ ok: false, msg: "Please enter a valid email address." });
      return;
    }
    setEmailSaving(true);
    try {
      const res: any = await updateEmail(trimmed);
      if (!res?.ok) throw new Error(res?.error || "Failed to update email.");
      // Update cached profile
      if (profile) setProfile({ ...profile, email: trimmed });
      setEmail(trimmed);
      setEmailStatus({ ok: true, msg: "Email updated successfully." });
    } catch (err: any) {
      setEmailStatus({ ok: false, msg: err?.message || "Failed to update email." });
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <div className="page fade-up">
      <div className="page-title">Settings</div>
      <div className="page-subtitle">Manage your account.</div>

      {/* Profile info */}
      {profile && (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>
            Profile
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
              background: "rgba(92,107,255,0.18)", border: "1px solid rgba(92,107,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#B0B8FF",
            }}>
              {profile.name?.charAt(0).toUpperCase() || "?"}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{profile.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>ID #{profile.employee_id}</div>
            </div>
          </div>
        </div>
      )}

      {/* EOD Email */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>
          EOD Report Email
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
          EOD reports are emailed here after you send them. Use your SeaWorld email address.
        </div>
        <form onSubmit={onSaveEmail}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailStatus(null); }}
            placeholder="yourname@seaworld.com"
            autoComplete="email"
            inputMode="email"
          />

          {emailStatus && (
            <div style={{
              marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13,
              background: emailStatus.ok ? "var(--success-bg)" : "var(--danger-bg)",
              color: emailStatus.ok ? "#7EEFC4" : "#FFB0B0",
              border: `1px solid ${emailStatus.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}`,
            }}>
              {emailStatus.ok ? "✓ " : "⚠ "}{emailStatus.msg}
            </div>
          )}

          <button
            className="btn primary"
            type="submit"
            disabled={emailSaving}
            style={{ marginTop: 12 }}
          >
            {emailSaving ? <><span className="spinner" /> Saving…</> : "Save email"}
          </button>
        </form>
      </div>

      {/* Sign out */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 12 }}>
          Account
        </div>
        <button className="btn danger" onClick={() => logout()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
}
