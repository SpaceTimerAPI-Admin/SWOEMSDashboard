/**
 * BarcodeInput — reusable serial/barcode input with camera scanning.
 *
 * Two scan modes:
 *  1. BarcodeDetector (Chrome/Android) — live scan, fires as soon as barcode detected
 *  2. Claude vision fallback (iOS Safari, Firefox) — "📸 Capture & Read" button
 *     grabs a still frame, sends to /api/inventory-read-label, shows all
 *     candidate values so the user can tap the right one.
 */
import React, { useRef, useState, useEffect, useCallback } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

// ── Vision candidate picker overlay ──────────────────────────────────────────
interface VisionResult {
  serial: string | null;
  candidates: string[];
  note: string;
}

function CandidatePicker({
  result,
  onPick,
  onRetry,
  onClose,
}: {
  result: VisionResult;
  onPick: (val: string) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const all = Array.from(new Set([
    ...(result.serial ? [result.serial] : []),
    ...result.candidates,
  ])).filter(Boolean);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#1a1b26", borderRadius: 16, padding: 22, maxWidth: 360, width: "100%", border: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Select the correct value</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.5 }}>
          {result.note || "Claude found these values on the label. Tap the serial number."}
        </div>

        {all.length === 0 ? (
          <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>No values found on the label. Try again with better lighting or closer focus.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {all.map((v, i) => (
              <button
                key={i}
                onClick={() => onPick(v)}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 10, textAlign: "left",
                  background: i === 0 ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${i === 0 ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: i === 0 ? "#c7d2fe" : "#e2e8f0",
                  fontSize: 14, fontFamily: "monospace", fontWeight: i === 0 ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                {i === 0 && <span style={{ fontSize: 10, fontFamily: "sans-serif", fontWeight: 600, marginRight: 8, opacity: 0.7 }}>BEST MATCH</span>}
                {v}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onRetry} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            📸 Retake
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Type manually
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Camera overlay ────────────────────────────────────────────────────────────
function CameraOverlay({ onScan, onClose }: { onScan: (val: string) => void; onClose: () => void }) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const streamRef  = useRef<MediaStream | null>(null);

  const [error, setError]               = useState<string | null>(null);
  const [hint, setHint]                 = useState("Point camera at barcode or serial number label");
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const [capturing, setCapturing]       = useState(false);
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    let active = true;

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

        if ("BarcodeDetector" in window) {
          setHasBarcodeDetector(true);
          const detector = new (window as any).BarcodeDetector({
            formats: ["code_128","code_39","code_93","ean_13","ean_8","qr_code","data_matrix","upc_a","upc_e","itf","aztec"],
          });
          setHint("Hold steady — scanning…");
          async function tick() {
            if (!active) return;
            try {
              if (videoRef.current && videoRef.current.readyState >= 2) {
                const codes = await detector.detect(videoRef.current);
                if (codes.length > 0 && active) {
                  active = false;
                  stopStream();
                  onScan(codes[0].rawValue);
                  return;
                }
              }
            } catch {}
            if (active) rafRef.current = requestAnimationFrame(tick);
          }
          rafRef.current = requestAnimationFrame(tick);
        } else {
          // Claude vision fallback
          setHasBarcodeDetector(false);
          setHint("Aim at the label, then tap 📸 Capture & Read");
        }
      } catch (e: any) {
        if (e?.name === "NotAllowedError") setError("Camera permission denied. Allow camera access and try again.");
        else if (e?.name === "NotFoundError") setError("No camera found on this device.");
        else setError(`Camera error: ${e?.message || "unknown"}`);
      }
    }

    void start();
    return () => {
      active = false;
      stopStream();
    };
  }, [stopStream]);

  async function captureAndRead() {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    setHint("Reading label…");
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      // Compress to JPEG at 85% quality to keep payload reasonable
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

      const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
      const res = await fetch("/api/inventory-read-label", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64, mediaType: "image/jpeg" }),
      });
      const data = await res.json();

      if (!data.ok) {
        setHint(`Could not read label: ${data.error || "unknown error"}. Try again.`);
        return;
      }

      const all = Array.from(new Set([
        ...(data.serial ? [data.serial] : []),
        ...(data.candidates || []),
      ])).filter(Boolean);

      if (all.length === 0) {
        setHint("No values found. Adjust focus and try again.");
        return;
      }

      // If only one candidate, auto-select it
      if (all.length === 1) {
        stopStream();
        onScan(all[0]);
        return;
      }

      // Show candidate picker
      setVisionResult({ serial: data.serial, candidates: data.candidates || [], note: data.note || "" });
    } catch (e: any) {
      setHint(`Error: ${e?.message || "failed"}. Try again.`);
    } finally {
      setCapturing(false);
    }
  }

  function handlePick(val: string) {
    stopStream();
    onScan(val);
  }

  function handleRetry() {
    setVisionResult(null);
    setHint("Aim at the label, then tap 📸 Capture & Read");
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "#000", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(0,0,0,0.8)", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>📷 Scan Barcode</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{hint}</div>
          </div>
          <button onClick={() => { stopStream(); onClose(); }}
            style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 18px" }}>
            Cancel
          </button>
        </div>

        {/* Camera view */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Viewfinder overlay */}
          {!error && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: "80%", maxWidth: 320, height: 140, position: "relative" }}>
                {/* Dark mask */}
                <div style={{ position: "absolute", inset: "-9999px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
                {/* Corner brackets */}
                {(["top","bottom"] as const).flatMap(v => (["left","right"] as const).map(h => (
                  <div key={`${v}${h}`} style={{
                    position: "absolute", width: 32, height: 32,
                    [v]: 0, [h]: 0,
                    borderTop:    v === "top"    ? "3px solid #818cf8" : "none",
                    borderBottom: v === "bottom" ? "3px solid #818cf8" : "none",
                    borderLeft:   h === "left"   ? "3px solid #818cf8" : "none",
                    borderRight:  h === "right"  ? "3px solid #818cf8" : "none",
                  }} />
                )))}
                {/* Scan line — only when using BarcodeDetector */}
                {hasBarcodeDetector && (
                  <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #818cf8, transparent)", animation: "scan 2s ease-in-out infinite" }} />
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "rgba(0,0,0,0.85)" }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>📷</div>
              <div style={{ fontSize: 14, color: "#f87171", textAlign: "center", lineHeight: 1.6, marginBottom: 20 }}>{error}</div>
              <button onClick={() => { stopStream(); onClose(); }}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "10px 24px" }}>
                Type manually instead
              </button>
            </div>
          )}

          {/* Claude vision capture button — shown when BarcodeDetector unavailable */}
          {!error && !hasBarcodeDetector && !capturing && (
            <div style={{ position: "absolute", bottom: 32, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
              <button
                onClick={captureAndRead}
                style={{
                  padding: "14px 32px", borderRadius: 50, fontSize: 16, fontWeight: 700,
                  background: "rgba(129,140,248,0.9)", border: "2px solid #818cf8",
                  color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                  boxShadow: "0 4px 20px rgba(129,140,248,0.4)",
                }}
              >
                <span style={{ fontSize: 22 }}>📸</span>
                Capture &amp; Read
              </button>
            </div>
          )}

          {/* Capturing spinner */}
          {capturing && (
            <div style={{ position: "absolute", bottom: 32, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
              <span className="spinner" style={{ width: 24, height: 24, borderColor: "#818cf8", borderTopColor: "transparent" }} />
              <span style={{ color: "#c7d2fe", fontSize: 14, fontWeight: 600 }}>Reading with Claude…</span>
            </div>
          )}
        </div>

        <style>{`@keyframes scan { 0%,100%{top:10%} 50%{top:85%} }`}</style>
      </div>

      {/* Candidate picker — rendered on top of camera */}
      {visionResult && (
        <CandidatePicker
          result={visionResult}
          onPick={handlePick}
          onRetry={handleRetry}
          onClose={() => { stopStream(); onClose(); }}
        />
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function BarcodeInput({ value, onChange, placeholder, autoFocus, onEnter }: Props) {
  const [showCamera, setShowCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  function handleScan(val: string) {
    setShowCamera(false);
    onChange(val);
    // Small delay then trigger onEnter so lookup fires automatically after scan
    if (onEnter) setTimeout(onEnter, 150);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Big camera button — primary on mobile */}
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
