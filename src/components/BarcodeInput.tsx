/**
 * BarcodeInput — reusable serial/barcode input with camera scanning.
 *
 * Strategy:
 *  1. Open camera fullscreen overlay.
 *  2. If BarcodeDetector API is available (Chrome/Android), use it for instant scanning.
 *  3. If not available (iOS Safari, Firefox, desktop Safari), fall back to:
 *     - "📸 Capture" button → grabs a frame from the video → sends JPEG to
 *       /api/barcode-read (Claude Haiku vision) → returns the serial number.
 *  4. Manual text entry always available as a fallback.
 */
import React, { useRef, useState, useEffect, useCallback } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
}

function videoToJpeg(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// ── CameraOverlay ─────────────────────────────────────────────────────────────

function CameraOverlay({ onScan, onClose }: { onScan: (val: string) => void; onClose: () => void }) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const rafRef     = useRef<number>(0);
  const streamRef  = useRef<MediaStream | null>(null);
  const activeRef  = useRef(true);

  const [error,      setError]      = useState<string | null>(null);
  const [hint,       setHint]       = useState("Point camera at barcode or serial label");
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState<string | null>(null);
  const [useAiFallback, setUseAiFallback] = useState(false);

  // Start camera
  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Try BarcodeDetector first
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({
            formats: ["code_128","code_39","code_93","ean_13","ean_8","qr_code","data_matrix","upc_a","upc_e","itf","aztec","pdf417"],
          });
          setHint("Hold steady — scanning…");

          async function tick() {
            if (!activeRef.current) return;
            try {
              if (videoRef.current && videoRef.current.readyState >= 2) {
                const codes = await detector.detect(videoRef.current);
                if (codes.length > 0 && activeRef.current) {
                  activeRef.current = false;
                  streamRef.current?.getTracks().forEach(t => t.stop());
                  onScan(codes[0].rawValue);
                  return;
                }
              }
            } catch {}
            if (activeRef.current) rafRef.current = requestAnimationFrame(tick);
          }
          rafRef.current = requestAnimationFrame(tick);
        } else {
          // No BarcodeDetector — switch to AI capture mode
          setUseAiFallback(true);
          setHint("Frame the label clearly, then tap Capture");
        }
      } catch (e: any) {
        if (e?.name === "NotAllowedError") setError("Camera permission denied. Allow camera access and try again.");
        else if (e?.name === "NotFoundError") setError("No camera found on this device.");
        else setError(`Camera error: ${e?.message || "unknown"}`);
      }
    }
    void start();
    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Send frame to Claude
  const captureAndRead = useCallback(async () => {
    if (!videoRef.current) return;
    setAiError(null);
    setAiLoading(true);
    setHint("Reading label…");
    try {
      const jpeg = videoToJpeg(videoRef.current);
      const res = await fetch("/api/barcode-read", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ image: jpeg }),
      });
      const data = await res.json();
      if (data.ok && data.value) {
        activeRef.current = false;
        streamRef.current?.getTracks().forEach(t => t.stop());
        onScan(data.value);
      } else {
        setAiError(data.error || "Could not read a serial number. Try again or type it manually.");
        setHint("Frame the label clearly, then tap Capture");
      }
    } catch {
      setAiError("Network error — check your connection and try again.");
      setHint("Frame the label clearly, then tap Capture");
    } finally {
      setAiLoading(false);
    }
  }, [onScan]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "#000", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(0,0,0,0.85)", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>📷 Scan Barcode</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{hint}</div>
        </div>
        <button onClick={onClose}
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 18px" }}>
          Cancel
        </button>
      </div>

      {/* Camera view */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />

        {/* Viewfinder overlay (not shown during AI loading or error) */}
        {!error && !aiLoading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "85%", maxWidth: 340, height: 150, position: "relative" }}>
              <div style={{ position: "absolute", inset: "-9999px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={`${v}${h}`} style={{
                  position: "absolute", width: 34, height: 34,
                  [v]: 0, [h]: 0,
                  borderTop:    v === "top"    ? "3px solid #818cf8" : "none",
                  borderBottom: v === "bottom" ? "3px solid #818cf8" : "none",
                  borderLeft:   h === "left"   ? "3px solid #818cf8" : "none",
                  borderRight:  h === "right"  ? "3px solid #818cf8" : "none",
                }} />
              ))}
              {!useAiFallback && (
                <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #818cf8, transparent)", animation: "scan 2s ease-in-out infinite" }} />
              )}
            </div>
          </div>
        )}

        {/* AI loading spinner */}
        {aiLoading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 36, marginBottom: 10, animation: "spin 1s linear infinite" }}>🔍</div>
            <div style={{ fontSize: 14, color: "#c7d2fe", fontWeight: 600 }}>Reading label…</div>
          </div>
        )}

        {/* Camera error */}
        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "rgba(0,0,0,0.85)" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📷</div>
            <div style={{ fontSize: 14, color: "#f87171", textAlign: "center", lineHeight: 1.6, marginBottom: 20 }}>{error}</div>
            <button onClick={onClose}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "10px 24px" }}>
              Type manually instead
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar — AI capture button or error */}
      {!error && (
        <div style={{ padding: "16px 20px", background: "rgba(0,0,0,0.85)", flexShrink: 0 }}>
          {aiError && (
            <div style={{ fontSize: 12, color: "#f87171", textAlign: "center", marginBottom: 10 }}>{aiError}</div>
          )}
          {useAiFallback && (
            <button onClick={captureAndRead} disabled={aiLoading}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 12,
                background: aiLoading ? "rgba(129,140,248,0.3)" : "rgba(129,140,248,0.9)",
                border: "none", color: "#fff", fontSize: 16, fontWeight: 700,
                cursor: aiLoading ? "default" : "pointer", letterSpacing: "0.02em",
              }}>
              {aiLoading ? "Reading…" : "📸 Capture & Read"}
            </button>
          )}
          {!useAiFallback && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
              Auto-scanning — hold steady over the barcode
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes scan { 0%,100%{top:10%} 50%{top:85%} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── BarcodeInput (public component) ──────────────────────────────────────────

export default function BarcodeInput({ value, onChange, placeholder, autoFocus, onEnter }: Props) {
  const [showCamera, setShowCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  function handleScan(val: string) {
    setShowCamera(false);
    onChange(val);
    // Small delay then auto-trigger lookup so user doesn't have to press a button
    if (onEnter) setTimeout(onEnter, 150);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => setShowCamera(true)}
          style={{
            flexShrink: 0, height: 42, padding: "0 14px",
            background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.4)",
            borderRadius: 10, color: "#c7d2fe", fontSize: 13, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
          <span style={{ fontSize: 18 }}>📷</span>
          <span>Scan</span>
        </button>
        <input
          ref={inputRef}
          className="input"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } }}
          placeholder={placeholder || "Or type serial / asset tag…"}
          style={{ flex: 1, fontFamily: value ? "monospace" : undefined }}
        />
      </div>
      {showCamera && <CameraOverlay onScan={handleScan} onClose={() => setShowCamera(false)} />}
    </>
  );
}
