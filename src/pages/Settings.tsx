import React, { useEffect, useRef, useState } from "react";
import { logout, getProfile, setProfile, getRole } from "../lib/auth";
import { updateEmail, loadUserPreferences, saveUserPreferences } from "../lib/api";
import { applyTheme, setCachedPrefs, PRESETS, type ThemePreset, type UserPreferences } from "../lib/theme";

export default function Settings() {
  const profile = getProfile();

  const [email, setEmail] = useState(profile?.email || "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Theme
  const [prefs, setPrefs] = useState<UserPreferences>({});
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeStatus, setThemeStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (profile?.email && !email) setEmail(profile.email);
    // Load preferences from server
    loadUserPreferences().then((res: any) => {
      if (res?.ok) {
        const p = res.data?.preferences ?? res.preferences ?? {};
        setPrefs(p);
        if (p.backgroundImage) setBgPreview(p.backgroundImage);
        applyTheme(p);
        setCachedPrefs(p);
      }
      setPrefsLoaded(true);
    });
  }, []);

  // ── Email save ─────────────────────────────────────────────────────────────
  async function onSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailStatus(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setEmailStatus({ ok: false, msg: "Email is required." }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailStatus({ ok: false, msg: "Please enter a valid email address." }); return;
    }
    setEmailSaving(true);
    try {
      const res: any = await updateEmail(trimmed);
      if (!res?.ok) throw new Error(res?.error || "Failed to update email.");
      if (profile) setProfile({ ...profile, email: trimmed });
      setEmail(trimmed);
      setEmailStatus({ ok: true, msg: "Email updated successfully." });
    } catch (err: any) {
      setEmailStatus({ ok: false, msg: err?.message || "Failed to update email." });
    } finally { setEmailSaving(false); }
  }

  // ── Theme helpers ──────────────────────────────────────────────────────────
  async function savePrefs(updates: Partial<UserPreferences>) {
    const merged = { ...prefs, ...updates };
    setPrefs(merged);
    applyTheme(merged);
    setCachedPrefs(merged);
    setThemeSaving(true);
    setThemeStatus(null);
    try {
      const res: any = await saveUserPreferences(merged);
      if (!res?.ok) throw new Error(res?.error || "Failed to save");
      setThemeStatus({ ok: true, msg: "Theme saved." });
      setTimeout(() => setThemeStatus(null), 2000);
    } catch (err: any) {
      setThemeStatus({ ok: false, msg: err?.message || "Failed to save theme." });
    } finally { setThemeSaving(false); }
  }

  function onSelectPreset(id: ThemePreset) {
    savePrefs({ theme: id });
  }

  function onCustomColor(hex: string) {
    savePrefs({ theme: "custom", primaryColor: hex });
  }

  async function onBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Compress to max ~1.5MB
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        const maxW = 1920;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);
        setBgPreview(compressed);
        // Use functional update to ensure we have latest prefs including theme
        setPrefs(latest => {
          const updated = { ...latest, backgroundImage: compressed };
          applyTheme(updated);
          setCachedPrefs(updated);
          saveUserPreferences(updated);
          return updated;
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function removeBg() {
    setBgPreview(null);
    savePrefs({ backgroundImage: "" });
  }

  const activeTheme = prefs.theme || "seaworld";

  return (
    <div className="page fade-up">
      <div className="page-title">Settings</div>
      <div className="page-subtitle">Manage your account.</div>

      {/* Profile info */}
      {profile && (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>Profile</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: "rgba(92,107,255,0.18)", border: "1px solid rgba(92,107,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#B0B8FF" }}>
              {profile.name?.charAt(0).toUpperCase() || "?"}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{profile.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>ID #{profile.employee_id}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── COLOR SCHEME ──────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 12 }}>
          Color Scheme
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => onSelectPreset(p.id)}
              style={{
                padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                border: `2px solid ${activeTheme === p.id ? p.primary : "rgba(255,255,255,0.08)"}`,
                background: activeTheme === p.id ? `${p.primary}22` : "rgba(255,255,255,0.04)",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{p.emoji}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: activeTheme === p.id ? p.primary : "var(--muted)" }}>
                {p.label}
              </div>
              <div style={{ width: 20, height: 4, borderRadius: 99, background: p.primary, margin: "5px auto 0" }} />
            </button>
          ))}

          {/* Custom color */}
          <button
            onClick={() => document.getElementById("custom-color-input")?.click()}
            style={{
              padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center",
              border: `2px solid ${activeTheme === "custom" ? (prefs.primaryColor || "#818cf8") : "rgba(255,255,255,0.08)"}`,
              background: activeTheme === "custom" ? `${prefs.primaryColor || "#818cf8"}22` : "rgba(255,255,255,0.04)",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>🎨</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: activeTheme === "custom" ? (prefs.primaryColor || "#818cf8") : "var(--muted)" }}>Custom</div>
            <div style={{ width: 20, height: 4, borderRadius: 99, background: prefs.primaryColor || "#818cf8", margin: "5px auto 0" }} />
          </button>
        </div>

        <input
          id="custom-color-input"
          type="color"
          defaultValue={prefs.primaryColor || "#818cf8"}
          onChange={e => onCustomColor(e.target.value)}
          style={{ display: "none" }}
        />

        {themeStatus && (
          <div style={{ fontSize: 12, color: themeStatus.ok ? "#7EEFC4" : "#FFB0B0", marginTop: 4 }}>
            {themeStatus.ok ? "✓ " : "⚠ "}{themeStatus.msg}
          </div>
        )}
      </div>

      {/* ── BACKGROUND IMAGE ──────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 6 }}>
          Background Photo
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
          Personal background image — only you see it. Overlaid behind the app.
        </div>

        {bgPreview ? (
          <div style={{ position: "relative", marginBottom: 12 }}>
            <img src={bgPreview} alt="Background preview" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10, display: "block", border: "1px solid var(--border)" }} />
            <button
              onClick={removeBg}
              style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", color: "#fff", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
            >×</button>
          </div>
        ) : null}

        {/* Opacity slider — only show when bg is set */}
        {bgPreview && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6 }}>
              Opacity — {prefs.backgroundOpacity ?? 60}%
            </div>
            <input
              type="range" min={10} max={100} step={5}
              value={prefs.backgroundOpacity ?? 60}
              onChange={e => savePrefs({ backgroundOpacity: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--primary)" }}
            />
          </div>
        )}

        <input ref={bgInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onBgFile} />
        <button className="btn small" onClick={() => bgInputRef.current?.click()}>
          🖼️ {bgPreview ? "Change photo" : "Choose photo"}
        </button>
      </div>

      {/* EOD Email — EMS and Admin only */}
      {getRole() !== "show_tech" && (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>EOD Report Email</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
            EOD reports are emailed here after you send them. Use your SeaWorld email address.
          </div>
          <form onSubmit={onSaveEmail}>
            <input className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailStatus(null); }} placeholder="yourname@seaworld.com" autoComplete="email" inputMode="email" />
            {emailStatus && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13, background: emailStatus.ok ? "var(--success-bg)" : "var(--danger-bg)", color: emailStatus.ok ? "#7EEFC4" : "#FFB0B0", border: `1px solid ${emailStatus.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}` }}>
                {emailStatus.ok ? "✓ " : "⚠ "}{emailStatus.msg}
              </div>
            )}
            <button className="btn primary" type="submit" disabled={emailSaving} style={{ marginTop: 12 }}>
              {emailSaving ? <><span className="spinner" /> Saving…</> : "Save email"}
            </button>
          </form>
        </div>
      )}

      {/* Sign out */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 12 }}>Account</div>
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
