import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { showTechRegister } from "../lib/api";

export default function ShowTechRegister() {
  const { code } = useParams<{ code: string }>();
  const [form, setForm] = useState({ name: "", employee_id: "", email: "", pin: "", pin_confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError("Full name is required."); return; }
    if (!form.employee_id.trim()) { setError("Employee ID is required."); return; }
    if (!form.email.trim() || !form.email.includes("@")) { setError("Valid email required."); return; }
    if (!/^\d{4}$/.test(form.pin)) { setError("PIN must be exactly 4 digits."); return; }
    if (form.pin !== form.pin_confirm) { setError("PINs do not match."); return; }

    setBusy(true);
    setError(null);
    try {
      const res: any = await showTechRegister({ code: code || "", ...form });
      if (!res?.ok) throw new Error(res?.error || "Registration failed.");
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!code) return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.icon}>🔗</div>
        <h2 style={styles.title}>Invalid Link</h2>
        <p style={styles.sub}>Please scan the QR code from the office to access this page.</p>
      </div>
    </div>
  );

  if (success) return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h2 style={{ ...styles.title, color: "#34d399" }}>You're all set!</h2>
        <p style={styles.sub}>Your Show Tech account has been created. You can now log in to the SWOEMS dashboard.</p>
        <Link to="/login" style={styles.btn}>Go to Login →</Link>
      </div>
    </div>
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={styles.icon}>🎡</div>
          <h1 style={styles.title}>Show Tech Portal</h1>
          <p style={styles.sub}>SeaWorld Entertainment Maintenance</p>
          <div style={{
            display: "inline-block", marginTop: 8, padding: "3px 12px", borderRadius: 99,
            background: "rgba(52,211,153,0.12)", color: "#34d399",
            border: "1px solid rgba(52,211,153,0.25)", fontSize: 12, fontWeight: 600,
          }}>
            Show Tech Registration
          </div>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={styles.label}>
            <span style={styles.fieldLabel}>Full Name</span>
            <input
              style={styles.input}
              type="text"
              placeholder="Alex Johnson"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              autoComplete="name"
            />
          </label>

          <label style={styles.label}>
            <span style={styles.fieldLabel}>Employee ID</span>
            <input
              style={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="12345"
              value={form.employee_id}
              onChange={e => set("employee_id", e.target.value)}
            />
          </label>

          <label style={styles.label}>
            <span style={styles.fieldLabel}>Email Address</span>
            <input
              style={styles.input}
              type="email"
              placeholder="name@seaworld.com"
              value={form.email}
              onChange={e => set("email", e.target.value)}
              autoComplete="email"
            />
          </label>

          <label style={styles.label}>
            <span style={styles.fieldLabel}>4-Digit PIN</span>
            <input
              style={styles.input}
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={form.pin}
              onChange={e => set("pin", e.target.value)}
              autoComplete="new-password"
            />
          </label>

          <label style={styles.label}>
            <span style={styles.fieldLabel}>Confirm PIN</span>
            <input
              style={styles.input}
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={form.pin_confirm}
              onChange={e => set("pin_confirm", e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13,
            background: "rgba(239,68,68,0.1)", color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.25)", lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={busy}
          style={{
            ...styles.btn,
            marginTop: 18,
            opacity: busy ? 0.7 : 1,
            cursor: busy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {busy
            ? <><span style={styles.spinner} /> Creating account…</>
            : "Create Account"}
        </button>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link to="/login" style={{ fontSize: 12, color: "#6b7280", textDecoration: "none" }}>
            Already have an account? Log in →
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100svh",
    background: "#0d0f1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    background: "#161827",
    borderRadius: 20,
    padding: "32px 24px",
    border: "1px solid #2d3147",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  icon: {
    fontSize: 40,
    textAlign: "center",
    marginBottom: 8,
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: "#e5e7eb",
    textAlign: "center",
  } as React.CSSProperties,
  sub: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 1.5,
  } as React.CSSProperties,
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid #2d3147",
    background: "#0d0f1a",
    color: "#e5e7eb",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    WebkitAppearance: "none",
  } as React.CSSProperties,
  btn: {
    display: "block",
    width: "100%",
    padding: "13px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    textAlign: "center",
    textDecoration: "none",
    boxSizing: "border-box",
  } as React.CSSProperties,
  spinner: {
    display: "inline-block",
    width: 16,
    height: 16,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  } as React.CSSProperties,
};
