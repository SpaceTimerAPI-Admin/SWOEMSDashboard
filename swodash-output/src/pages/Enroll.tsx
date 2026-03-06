import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { enroll } from "../lib/api";

export default function Enroll() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      employee_id: employeeId.trim(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      pin: pin.trim(),
      enrollment_code: enrollmentCode.trim(),
    };

    if (!payload.employee_id || !payload.name || !payload.email || !payload.pin || !payload.enrollment_code) {
      setError("All fields are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!/^\d{4}$/.test(payload.pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (payload.pin !== confirmPin.trim()) {
      setError("PINs do not match.");
      return;
    }

    setLoading(true);
    try {
      const res: any = await enroll(payload);
      if (!res?.ok) {
        setError(res?.error || "Enrollment failed.");
        return;
      }
      nav("/login");
    } catch (err: any) {
      setError(err?.message || "Enrollment failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--text)" }}>Create Account</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
            You'll need an enrollment code from your admin to get started.
          </div>
        </div>

        <div className="card" style={{ padding: "20px" }}>
          <form onSubmit={onSubmit}>

            {/* Identity section */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>
              Your Info
            </div>

            <label>
              <div className="field-label">Full Name</div>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="e.g. Alex Johnson"
              />
            </label>

            <label style={{ marginTop: 2 }}>
              <div className="field-label">Employee ID</div>
              <input
                className="input"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                inputMode="numeric"
                autoComplete="username"
                placeholder="e.g. 12345"
              />
            </label>

            <label style={{ marginTop: 2 }}>
              <div className="field-label">SeaWorld Email</div>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="yourname@seaworld.com"
              />
            </label>

            {/* PIN section */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0 14px" }} />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>
              Set Your PIN
            </div>

            <label>
              <div className="field-label">4‑digit PIN</div>
              <input
                className="input"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
                placeholder="••••"
              />
            </label>

            <label style={{ marginTop: 2 }}>
              <div className="field-label">Confirm PIN</div>
              <input
                className="input"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
                placeholder="••••"
              />
            </label>

            {/* Admin code section */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0 14px" }} />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>
              Authorization
            </div>

            <label>
              <div className="field-label">Enrollment Code</div>
              <input
                className="input"
                value={enrollmentCode}
                onChange={(e) => setEnrollmentCode(e.target.value)}
                autoComplete="one-time-code"
                placeholder="Code from your admin"
              />
            </label>

            {error && (
              <div style={{
                marginTop: 12, padding: "9px 13px", borderRadius: 10, fontSize: 13,
                background: "var(--danger-bg)", color: "#FFB0B0",
                border: "1px solid rgba(255,84,84,0.25)",
              }}>
                {error}
              </div>
            )}

            <button className="btn primary full" style={{ marginTop: 16 }} type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> Creating account…</> : "Create account"}
            </button>
          </form>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <Link to="/login" style={{ fontSize: 13, color: "var(--muted)" }}>Already have an account? Sign in</Link>
          </div>
        </div>

      </div>
    </div>
  );
}
