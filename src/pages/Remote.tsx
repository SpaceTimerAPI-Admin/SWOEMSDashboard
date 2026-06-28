import React, { useEffect, useRef, useState } from "react";
import { getRole } from "../lib/auth";

const REMOTE_URL = (import.meta.env.VITE_REMOTE_URL || "").replace(/\/$/, "");

const PARKS = [
  { name: "SeaWorld Orlando",   lat: 28.4118,  lng: -81.4613, radius: 800 },
  { name: "Aquatica Orlando",   lat: 28.4074,  lng: -81.4613, radius: 600 },
  { name: "Discovery Cove",     lat: 28.4096,  lng: -81.4706, radius: 600 },
];

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


export default function Remote() {
  const role = getRole();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "locating" | "allowed" | "denied">("idle");
  const [locatedPark, setLocatedPark] = useState<string>("");

  function requestLocation() {
    if (!navigator.geolocation) { setLocationStatus("denied"); return; }
    setLocationStatus("requesting");
    // Short delay to show "requesting" state before browser prompt fires
    setTimeout(() => {
      setLocationStatus("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const match = PARKS.find(p => haversineDistance(latitude, longitude, p.lat, p.lng) <= p.radius);
          if (match) {
            setLocatedPark(match.name);
            setLocationStatus("allowed");
          } else {
            setLocationStatus("denied");
          }
        },
        () => setLocationStatus("denied"),
        { timeout: 10000, maximumAge: 60000 }
      );
    }, 600);
  }

  if (role === "show_tech") {
    return (
      <div className="page fade-up">
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>Access restricted.</div>
        </div>
      </div>
    );
  }

  // Location gate modal — shown until access is granted
  if (locationStatus !== "allowed") {
    return (
      <div className="page fade-up" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
        <div className="card" style={{ maxWidth: 340, width: "100%", padding: "32px 24px", textAlign: "center" }}>

          {/* Icon */}
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
            background: locationStatus === "denied" ? "rgba(248,113,113,0.12)" : "rgba(52,211,153,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28,
          }}>
            {locationStatus === "denied" ? "🚫" : locationStatus === "locating" || locationStatus === "requesting" ? "📡" : "📍"}
          </div>

          {/* Title */}
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
            {locationStatus === "idle" && "Location Required"}
            {locationStatus === "requesting" && "Allow Location Access"}
            {locationStatus === "locating" && "Locating…"}
            {locationStatus === "denied" && "Access Denied"}
          </div>

          {/* Message */}
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 24 }}>
            {locationStatus === "idle" && (
              <>Q-SYS Viewer is only accessible on-property at SeaWorld Orlando, Aquatica, or Discovery Cove.<br /><br />Tap below to verify your location.</>
            )}
            {locationStatus === "requesting" && (
              <>When your browser asks for permission, tap <strong style={{ color: "var(--text)" }}>Allow</strong> to continue.</>
            )}
            {locationStatus === "locating" && (
              <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <span className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} />
                Checking your location…
              </span>
            )}
            {locationStatus === "denied" && (
              <>Your location could not be verified. You must be on-property at SeaWorld Orlando, Aquatica, or Discovery Cove to access Q-SYS Viewer.</>
            )}
          </div>

          {/* Progress dots for locating */}
          {(locationStatus === "requesting" || locationStatus === "locating") && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
              {["Requesting", "Locating", "Verifying"].map((step, i) => {
                const active = (locationStatus === "requesting" && i === 0) ||
                               (locationStatus === "locating" && i <= 1);
                return (
                  <div key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: active ? "#34d399" : "rgba(255,255,255,0.1)",
                      transition: "background 0.3s",
                    }} />
                    <span style={{ fontSize: 10, color: active ? "#34d399" : "var(--muted2)" }}>{step}</span>
                    {i < 2 && <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.1)", marginLeft: 2 }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action button */}
          {(locationStatus === "idle" || locationStatus === "denied") && (
            <button
              className="btn primary"
              style={{ width: "100%", padding: "12px", fontSize: 14, fontWeight: 600 }}
              onClick={requestLocation}
            >
              {locationStatus === "denied" ? "Try Again" : "Verify My Location"}
            </button>
          )}

          {/* Park list */}
          {locationStatus === "idle" && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              {PARKS.map(p => (
                <div key={p.name} style={{
                  fontSize: 11, color: "var(--muted2)", padding: "6px 10px",
                  background: "rgba(255,255,255,0.03)", borderRadius: 8,
                  border: "1px solid var(--border)",
                }}>
                  📍 {p.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!REMOTE_URL) {
    return (
      <div className="page fade-up">
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚙️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Remote not configured</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Set VITE_REMOTE_URL in Netlify environment variables.</div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (locationStatus !== "allowed" || !REMOTE_URL) return;

    // Auto-login to Guacamole via token API, then redirect to the connection
    async function autoLogin() {
      try {
        setStatus("connecting");
        setIframeSrc("");

        // Step 1 — Get auth token
        const tokenRes = await fetch(`${REMOTE_URL}/api/tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ username: "admin", password: "swoems2026" }),
        });

        if (!tokenRes.ok) throw new Error("Auth failed");
        const tokenData = await tokenRes.json();
        const token = tokenData.authToken;
        const dataSource = tokenData.dataSource || "default";

        // Step 2 — Get list of connections
        const connRes = await fetch(
          `${REMOTE_URL}/api/session/data/${dataSource}/connectionGroups/ROOT/tree?token=${token}`
        );
        if (!connRes.ok) throw new Error("Could not fetch connections");
        const connData = await connRes.json();

        // Find first connection
        const connections = connData.childConnections || [];
        if (connections.length === 0) throw new Error("No connections found");

        const connId = connections[0].identifier;

        // Step 3 — Build direct connection URL
        const encoded = btoa(`${connId}\0c\0${dataSource}`);
        const url = `${REMOTE_URL}/#/client/${encoded}?token=${token}`;
        setIframeSrc(url);
        setStatus("connected");
      } catch (e) {
        console.error("[Remote] Auto-login failed:", e);
        // Fall back to showing Guacamole login page
        setIframeSrc(`${REMOTE_URL}/`);
        setStatus("connected");
      }
    }

    void autoLogin();
  }, [locationStatus]);

  function openInTab() {
    window.open(iframeSrc || `${REMOTE_URL}/`, "_blank");
  }

  function requestFullscreen() {
    iframeRef.current?.requestFullscreen?.();
  }

  function retry() {
    setStatus("connecting");
    setIframeSrc("");
    setTimeout(() => {
      setIframeSrc(`${REMOTE_URL}/`);
      setStatus("connected");
    }, 1000);
  }

  return (
    <div className="page fade-up" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", height: "100svh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
        <div>
          <div className="page-title">Q-SYS Viewer</div>
          <div className="page-subtitle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", display: "inline-block",
              background: status === "connected" ? "#34d399" : status === "error" ? "#f87171" : "#fbbf24",
            }} />
            {status === "connecting" ? "Connecting…" : status === "connected" ? `Connected · ${locatedPark || "Office PC"}` : "Connection error"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={openInTab} style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)",
            background: "rgba(255,255,255,0.05)", color: "var(--muted)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            🔗 Open in tab
          </button>
          <button onClick={requestFullscreen} className="btn primary" style={{ fontSize: 12, padding: "7px 12px" }}>
            ⛶ Full screen
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div style={{
        flex: 1, borderRadius: 12, overflow: "hidden",
        border: "1px solid var(--border)", background: "#000",
        position: "relative", minHeight: 0,
      }}>
        {status === "connecting" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "#0d0f1a", gap: 12, zIndex: 1,
          }}>
            <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Connecting to office PC…</div>
          </div>
        )}
        {status === "error" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "#0d0f1a", gap: 10, zIndex: 1,
          }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Cannot reach office PC</div>
            <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
              Make sure the PC is on and the tunnel services are running.
            </div>
            <button className="btn primary" style={{ marginTop: 6, fontSize: 13 }} onClick={retry}>
              Retry
            </button>
          </div>
        )}
        {iframeSrc && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="fullscreen"
            onLoad={() => setStatus("connected")}
            onError={() => setStatus("error")}
            title="QSys Remote"
          />
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--muted2)", textAlign: "center", padding: "6px 0 10px", flexShrink: 0 }}>
        Use "Open in tab" for best mobile experience
      </div>
    </div>
  );
}
