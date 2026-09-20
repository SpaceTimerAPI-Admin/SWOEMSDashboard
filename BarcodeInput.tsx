/**
 * BarcodeInput — serial/barcode input with camera scanning.
 * Uses html5-qrcode library loaded from CDN — proven iOS/Android support.
 */
import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window { Html5Qrcode: any; }
}

const SCANNER_ID = "swoems-barcode-scanner";

// Load html5-qrcode from CDN once
let libLoaded = false;
let libLoading: Promise<void> | null = null;

function loadLib(): Promise<void> {
  if (libLoaded) return Promise.resolve();
  if (libLoading) return libLoading;
  libLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
    s.onload = () => { libLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return libLoading;
}

function ManualEntry({ onScan }: { onScan: (v: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ padding: "14px 16px", background: "rgba(0,0,0,0.85)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Or type the serial number:</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && val.trim()) onScan(val.trim()); }}
          placeholder="Serial number…" autoFocus
          style={{ flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, color: "#fff", fontSize: 14, padding: "10px 14px", outline: "none" }} />
        <button onClick={() => val.trim() && onScan(val.trim())}
          style={{ background: "#4338ca", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "10px 18px" }}>
          Go
        </button>
      </div>
    </div>
  );
}

function CameraOverlay({ onScan, onClose }: { onScan: (v: string) => void; onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading");
  const [error, setError]   = useState("");
  const scannerRef = useRef<any>(null);
  const didInit    = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void init();
    return () => { void cleanup(); };
  }, []);

  async function init() {
    try {
      await loadLib();
      if (!window.Html5Qrcode) throw new Error("html5-qrcode failed to load");

      const scanner = new window.Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 120 },
          aspectRatio: 1.7,
          disableFlip: false,
          formatsToSupport: [
            0,  // QR_CODE
            1,  // AZTEC
            2,  // CODABAR
            3,  // CODE_39
            4,  // CODE_93
            5,  // CODE_128
            6,  // DATA_MATRIX
            8,  // EAN_8
            9,  // EAN_13
            11, // ITF
            13, // UPC_A
            14, // UPC_E
          ],
        },
        (decodedText: string) => {
          void cleanup();
          onScan(decodedText);
        },
        () => {} // error callback — suppress per-frame "not found" errors
      );

      setStatus("scanning");
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setError("Camera permission denied. Please allow camera access and try again.");
      } else {
        setError(`Could not start scanner: ${msg}`);
      }
      setStatus("error");
    }
  }

  async function cleanup() {
    try {
      const s = scannerRef.current;
      if (s) {
        if (s.isScanning) await s.stop();
        s.clear();
        scannerRef.current = null;
      }
    } catch {}
  }

  async function handleClose() {
    await cleanup();
    onClose();
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9000, background: "#000", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(0,0,0,0.9)", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>📷 Scan Barcode</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            {status === "loading" ? "Starting scanner…" : status === "scanning" ? "Point camera at barcode" : "Scanner error"}
          </div>
        </div>
        <button onClick={handleClose}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 18px" }}>
          Cancel
        </button>
      </div>

      {/* Scanner container — html5-qrcode renders the video here */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {status !== "error" && (
          <div id={SCANNER_ID} style={{ flex: 1, minHeight: 0 }} />
        )}

        {status === "loading" && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            Starting camera…
          </div>
        )}

        {status === "error" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📷</div>
            <div style={{ fontSize: 14, color: "#f87171", textAlign: "center", lineHeight: 1.7, marginBottom: 20 }}>{error}</div>
            <button onClick={handleClose}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "10px 24px" }}>
              Type manually instead
            </button>
          </div>
        )}

        {/* Always show manual entry as fallback */}
        {status === "scanning" && (
          <ManualEntry onScan={v => { void cleanup(); onScan(v); }} />
        )}
      </div>

      <style>{`
        #${SCANNER_ID} video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
        #${SCANNER_ID} { background: #000; }
        #${SCANNER_ID} img { display: none !important; }
        #${SCANNER_ID} > div:last-child { display: none !important; }
      `}</style>
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
