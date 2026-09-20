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
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        // Wait for the video element to be in the DOM
        let attempts = 0;
        while (!videoRef.current && attempts < 20) {
          await new Promise(r => setTimeout(r, 50));
          attempts++;
        }

        if (!videoRef.current || !active) return;

        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("autoplay", "true");
        videoRef.current.muted = true;

        try {
          await videoRef.current.play();
        } catch {
          // Some browsers need a user gesture — already have one since user tapped the button
        }

        setVideoReady(true);
        setHint("Hold steady — scanning…");

        if (!("BarcodeDetector" in window)) {
          setError("Automatic scanning not supported on this browser. Use Chrome on Android or Safari 17.4+ on iPhone.");
          return;
        }

        const detector = new (window as any).BarcodeDetector({
          formats: ["code_128","code_39","code_93","ean_13","ean_8","qr_code","data_matrix","upc_a","upc_e","itf","aztec"],
        });

        async function tick() {
          if (!active) return;
          try {
            if (videoRef.current && videoRef.current.readyState >= 2 && !videoRef.current.paused) {
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
        if (!active) return;
        if (e?.name === "NotAllowedError") setError("Camera permission denied. Tap Allow when prompted, then try again.");
        else if (e?.name === "NotFoundError") setError("No camera found on this device.");
        else if (e?.name === "OverconstrainedError") {
          // Retry without environment constraint
          try {
            const stream2 = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            if (!active) { stream2.getTracks().forEach(t => t.stop()); return; }
            streamRef.current = stream2;
            if (videoRef.current) {
              videoRef.current.srcObject = stream2;
              videoRef.current.muted = true;
              await videoRef.current.play();
              setVideoReady(true);
            }
          } catch { setError("Could not access camera."); }
        }
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(0,0,0,0.9)", flexShrink: 0, zIndex: 1 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>📷 Scan Barcode</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{hint}</div>
        </div>
        <button onClick={onClose}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 18px" }}>
          Cancel
        </button>
      </div>

      {/* Video fills remaining space */}
      <div style={{ flex: 1, position: "relative", background: "#111" }}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        {/* Viewfinder — only show when video is running */}
        {videoReady && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "75%", maxWidth: 300, height: 130, position: "relative" }}>
              <div style={{ position: "absolute", inset: "-100vh -100vw", background: "rgba(0,0,0,0.45)" }} />
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={`${v}${h}`} style={{
                  position: "absolute", width: 28, height: 28, zIndex: 2,
                  [v]: 0, [h]: 0,
                  borderTop:    v === "top"    ? "3px solid #818cf8" : "none",
                  borderBottom: v === "bottom" ? "3px solid #818cf8" : "none",
                  borderLeft:   h === "left"   ? "3px solid #818cf8" : "none",
                  borderRight:  h === "right"  ? "3px solid #818cf8" : "none",
                }} />
              ))}
              <div style={{ position: "absolute", left: 8, right: 8, height: 2, background: "linear-gradient(90deg,transparent,#818cf8,transparent)", zIndex: 2, animation: "scan 2s ease-in-out infinite" }} />
            </div>
          </div>
        )}

        {/* Loading state */}
        {!videoReady && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Starting camera…</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "rgba(0,0,0,0.9)" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📷</div>
            <div style={{ fontSize: 14, color: "#f87171", textAlign: "center", lineHeight: 1.7, marginBottom: 24 }}>{error}</div>
            <button onClick={onClose}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "10px 24px" }}>
              Type manually instead
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes scan { 0%,100%{top:8%} 50%{top:80%} }`}</style>
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
