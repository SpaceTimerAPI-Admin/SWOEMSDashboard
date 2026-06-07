import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const SITE_URL = import.meta.env.VITE_SITE_URL || "https://www.swoems.com";

// Minimal QR code generator using a public API
function qrUrl(text: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=000000&margin=2`;
}

export default function AdminQR() {
  const [code, setCode] = useState("");
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch the code from backend so it stays server-side
    fetch("/api/showtech-enrollment-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("md_token") || ""}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.code) {
          setCode(d.code);
          setRegistrationUrl(`${SITE_URL}/register/${d.code}`);
        }
      })
      .catch(() => {});
  }, []);

  function copyLink() {
    navigator.clipboard.writeText(registrationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function print() {
    window.print();
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #print-area { display: block !important; position: fixed; inset: 0; }
          #print-area * { display: revert !important; }
        }
      `}</style>

      <div className="page fade-up" style={{ paddingBottom: 60 }}>
        <Link to="/admin" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>← Admin</Link>

        <div style={{ marginTop: 12, marginBottom: 20 }}>
          <div className="page-title">Show Tech Registration</div>
          <div className="page-subtitle">QR code for office posting</div>
        </div>

        {/* Preview card */}
        <div className="card" style={{ padding: "24px 20px", marginBottom: 16, textAlign: "center" }}>
          {registrationUrl ? (
            <>
              <img
                src={qrUrl(registrationUrl)}
                alt="Registration QR Code"
                style={{ width: 200, height: 200, borderRadius: 12, display: "block", margin: "0 auto 16px" }}
              />
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                Show Tech Self-Registration
              </div>
              <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 16, lineHeight: 1.5 }}>
                Scan to create a Show Tech account.<br />Post this in the office or break room.
              </div>
              <div style={{
                padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border)", fontSize: 11, color: "var(--muted2)",
                wordBreak: "break-all", marginBottom: 16, fontFamily: "monospace",
              }}>
                {registrationUrl}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn" onClick={copyLink} style={{ fontSize: 13 }}>
                  {copied ? "✓ Copied!" : "📋 Copy Link"}
                </button>
                <button className="btn primary" onClick={print} style={{ fontSize: 13 }}>
                  🖨️ Print QR
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "24px 0" }}>
              <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
              <div style={{ fontSize: 13, color: "var(--muted2)" }}>Loading…</div>
            </div>
          )}
        </div>

        {/* Info card */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>How it works</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["1", "Print the QR code and post it in the office"],
              ["2", "Show Tech staff scan it with their phone"],
              ["3", "They fill in their name, employee ID, email, and set a PIN"],
              ["4", "Account is created instantly with Show Tech access"],
              ["5", "New accounts appear in the Admin → Users list immediately"],
            ].map(([num, text]) => (
              <div key={num} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", background: "rgba(92,107,255,0.2)",
                  color: "#B0B8FF", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>{num}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, paddingTop: 2 }}>{text}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(255,182,39,0.08)", border: "1px solid rgba(255,182,39,0.2)", fontSize: 12, color: "#FFD07A", lineHeight: 1.5 }}>
            ⚠️ To invalidate this QR code, update the <code>SHOW_TECH_ENROLLMENT_CODE</code> environment variable in Netlify and redeploy.
          </div>
        </div>
      </div>

      {/* Print-only area */}
      <div id="print-area" style={{ display: "none" }}>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#fff", padding: 40,
        }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎡</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 4 }}>
              SeaWorld Entertainment
            </div>
            <div style={{ fontSize: 16, color: "#444", marginBottom: 24 }}>
              Maintenance — Show Tech Portal
            </div>
            {registrationUrl && (
              <img
                src={qrUrl(registrationUrl)}
                alt="QR Code"
                style={{ width: 260, height: 260, display: "block", margin: "0 auto 24px" }}
              />
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              Scan to Create Your Account
            </div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.6 }}>
              Use your phone camera to scan this QR code.<br />
              Fill in your details to register for Show Tech access<br />
              to the SWOEMS maintenance dashboard.
            </div>
            <div style={{ fontSize: 11, color: "#999", wordBreak: "break-all", fontFamily: "monospace" }}>
              {registrationUrl}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
