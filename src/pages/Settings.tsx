import React from "react";
import { logout } from "../lib/auth";

export default function Settings() {
  return (
    <div className="container">
      <div className="h1">Settings</div>
      <div className="card">
        <div className="muted">
          This page will hold:
          <ul>
            <li>Open/Close procedures editor (DB-driven steps)</li>
            <li>Session / logout</li>
          </ul>
        </div>
        <div style={{marginTop:12}}>
          <button className="btn danger" onClick={logout}>Log out</button>
        </div>
      </div>
      <div className="spacer" />
    </div>
  );
}
