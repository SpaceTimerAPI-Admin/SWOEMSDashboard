/**
 * BarcodeInput — reusable serial/barcode input with camera scanning.
 * Shows a prominent "📷 Scan" button that opens the camera on mobile.
 * Falls back to manual text entry on desktop or unsupported browsers.
 */
import React, { useRef, useState, useEffect } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

function CameraOverlay({ onScan, onClose }: { onScan: (val: string) => void; onClose: () => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const rafRef    = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint]   = useState("Point camera at barcode or serial number label");

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
        if (!("BarcodeDetector" in window)) {
          setError("Automatic scanning not supported — type the serial number manually, or use Chrome on Android / Safari on iOS 17.4+");
          return;
        }
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
                streamRef.current?.getTracks().forEach(t => t.stop());
                onScan(codes[0].rawValue);
                return;
              }
            }
          } catch {}
          if (active) rafRef.current = requestAnimationFrame(tick);
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        if (e?.name === "NotAllowedError") setError("Camera permission denied. Allow camera access and try again.");
        else if (e?.name === "NotFoundError") setError("No camera found on this device.");
        else setError(`Camera error: ${e?.message || "unknown"}`);
      }
    }
    void start();
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "#000", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(0,0,0,0.8)", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>📷 Scan Barcode</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{hint}</div>
        </div>
        <button onClick={onClose}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 18px" }}>
          Cancel
        </button>
      </div>

      {/* Camera view */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />

        {/* Viewfinder overlay */}
        {!error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "80%", maxWidth: 320, height: 140, position: "relative" }}>
              {/* Dark mask */}
              <div style={{ position: "absolute", inset: "-9999px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
              {/* Corner brackets */}
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={`${v}${h}`} style={{
                  position: "absolute", width: 32, height: 32,
                  [v]: 0, [h]: 0,
                  borderTop:    v === "top"    ? "3px solid #818cf8" : "none",
                  borderBottom: v === "bottom" ? "3px solid #818cf8" : "none",
                  borderLeft:   h === "left"   ? "3px solid #818cf8" : "none",
                  borderRight:  h === "right"  ? "3px solid #818cf8" : "none",
                }} />
              ))}
              {/* Scan line */}
              <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #818cf8, transparent)", animation: "scan 2s ease-in-out infinite" }} />
            </div>
          </div>
        )}

        {/* Error state */}
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

      <style>{`@keyframes scan { 0%,100%{top:10%} 50%{top:85%} }`}</style>
    </div>
  );
}

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
