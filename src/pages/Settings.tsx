import React from "react";
import { logout } from "../lib/auth";

export default function Settings() {
  return (
    <div className="page fade-up">
      <div className="page-title">Settings</div>
      <div className="page-subtitle">Manage your account.</div>

      <div className="card" style={{ padding: "16px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted2)", marginBottom: 12 }}>
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
