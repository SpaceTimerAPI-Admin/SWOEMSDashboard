/**
 * BarcodeInput — serial/barcode input with camera scanning.
 *
 * Scanning strategy (in priority order):
 * 1. ZXing-js loaded from CDN — works on all browsers including iOS Safari
 * 2. Native BarcodeDetector API — Chrome Android / Safari 17.4+
 * 3. Manual text entry fallback
 */
import React, { useEffect, useRef, useState } from "react";

// ── ZXing loader ─────────────────────────────────────────────────────────────
let zxingPromise: Promise<any> | null = null;

function loadZXing(): Promise<any> {
  if (zxingPromise) return zxingPromise;
  zxingPromise = new Promise((resolve, reject) => {
    if ((window as any).ZXing) { resolve((window as any).ZXing); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
    script.onload = () => resolve((window as any).ZXing);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return zxingPromise;
}

// ── Manual entry shown at bottom when auto-scan unavailable ──────────────────
function ManualEntry({ onScan }: { onScan: (val: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px", background: "rgba(0,0,0,0.92)", borderTop: "1px solid rgba(255,255,255,0.1)", zIndex: 3 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
        Type the serial number manually:
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && val.trim()) onScan(val.trim()); }}
          placeholder="Serial number…" autoFocus
          style={{ flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, padding: "10px 14px", outline: "none", fontFamily: val ? "monospace" : undefined }} />
        <button onClick={() => val.trim() && onScan(val.trim())}
          style={{ background: "#4338ca", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "10px 18px" }}>
          Go
        </button>
      </div>
    </div>
  );
}

// ── Camera overlay ────────────────────────────────────────────────────────────
function CameraOverlay({ onScan, onClose }: { onScan: (val: string) => void; onClose: () => void }) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const activeRef  = useRef(true);
  const intervalRef = useRef<any>(null);

  const [status, setStatus]     = useState<"loading" | "scanning" | "error" | "manual">("loading");
  const [hint, setHint]         = useState("Starting camera…");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    void start();
    return () => {
      activeRef.current = false;
      clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function start() {
    // 1. Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;

      await new Promise<void>(res => {
        video.onloadedmetadata = () => res();
        setTimeout(res, 3000);
      });

      if (!activeRef.current) return;
      try { await video.play(); } catch {}

    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.name === "NotAllowedError" ? "Camera permission denied." : `Camera error: ${e?.message}`);
      return;
    }

    // 2. Load ZXing and start scanning
    setHint("Loading scanner…");
    try {
      const ZXing = await loadZXing();
      if (!activeRef.current) return;

      const hints = new Map();
      const formats = [
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.QR_CODE,
        ZXing.BarcodeFormat.DATA_MATRIX,
        ZXing.BarcodeFormat.ITF,
      ];
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

      const reader = new ZXing.MultiFormatReader();
      reader.setHints(hints);

      setStatus("scanning");
      setHint("Point at barcode — hold steady");

      intervalRef.current = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!activeRef.current || !video || !canvas) return;
        if (video.readyState < 2 || video.videoWidth === 0) return;

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        try {
          const luminance = new ZXing.RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
          const binary    = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
          const result    = reader.decode(binary);
          if (result && activeRef.current) {
            activeRef.current = false;
            clearInterval(intervalRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            onScan(result.getText());
          }
        } catch {
          // NotFoundException is thrown when no barcode found — normal, ignore
        }
      }, 250);

    } catch (e) {
      console.warn("[BarcodeInput] ZXing failed:", e);
      // Fall back to manual entry with camera still showing
      setStatus("manual");
      setHint("Scanner unavailable — type serial below");
    }
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9000, background: "#000", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(0,0,0,0.9)", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>📷 Scan Barcode</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{hint}</div>
        </div>
        <button onClick={onClose}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 18px" }}>
          Cancel
        </button>
      </div>

      {/* Camera */}
      <div style={{ flex: 1, position: "relative", background: "#000", overflow: "hidden" }}>
        <video ref={videoRef} playsInline autoPlay muted
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", WebkitTransform: "translateZ(0)", transform: "translateZ(0)" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Viewfinder */}
        {status === "scanning" && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: 280, height: 120, position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)", borderRadius: 4 }} />
              {([["top","left"],["top","right"],["bottom","left"],["bottom","right"]] as const).map(([v,h]) => (
                <div key={`${v}${h}`} style={{ position: "absolute", width: 24, height: 24, zIndex: 2, [v]: 0, [h]: 0,
                  borderTop: v==="top" ? "3px solid #818cf8" : "none", borderBottom: v==="bottom" ? "3px solid #818cf8" : "none",
                  borderLeft: h==="left" ? "3px solid #818cf8" : "none", borderRight: h==="right" ? "3px solid #818cf8" : "none" }} />
              ))}
              <div style={{ position: "absolute", left: 8, right: 8, height: 2, background: "linear-gradient(90deg,transparent,#818cf8,transparent)", zIndex: 2, animation: "bscan 2s ease-in-out infinite" }} />
            </div>
          </div>
        )}

        {/* Loading */}
        {status === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Starting camera…</div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "rgba(0,0,0,0.92)" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📷</div>
            <div style={{ fontSize: 14, color: "#f87171", textAlign: "center", lineHeight: 1.7, marginBottom: 24 }}>{errorMsg}</div>
            <button onClick={onClose}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "10px 24px" }}>
              Type manually instead
            </button>
          </div>
        )}

        {/* Manual fallback */}
        {status === "manual" && <ManualEntry onScan={val => { onClose(); onScan(val); }} />}
      </div>

      <style>{`@keyframes bscan { 0%,100%{top:8%} 50%{top:78%} }`}</style>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

export default function BarcodeInput({ value, onChange, placeholder, autoFocus, onEnter }: Props) {
  const [showCamera, setShowCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  function handleScan(val: string) {
    setShowCamera(false);
    onChange(val);
    if (onEnter) setTimeout(onEnter, 150);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => setShowCamera(true)}
          style={{ flexShrink: 0, height: 42, padding: "0 14px", background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.4)", borderRadius: 10, color: "#c7d2fe", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 18 }}>📷</span>
          <span>Scan</span>
        </button>
        <input ref={inputRef} className="input" value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } }}
          placeholder={placeholder || "Or type serial / asset tag…"}
          style={{ flex: 1, fontFamily: value ? "monospace" : undefined }} />
      </div>
      {showCamera && <CameraOverlay onScan={handleScan} onClose={() => setShowCamera(false)} />}
    </>
  );
}
