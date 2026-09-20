/**
 * BarcodeInput — serial/barcode input with camera scanning.
 *
 * On mobile: opens the native camera via file input (capture="environment").
 * iOS uses its built-in barcode/text recognition to read the image.
 * We process the captured image with ZXing for the actual decode.
 *
 * This approach is far more reliable than live video scanning on iOS because
 * it uses Apple's own camera app which has native barcode detection built in.
 */
import React, { useRef, useState, useEffect } from "react";

declare global { interface Window { ZXing: any; } }

let zxingPromise: Promise<any> | null = null;
function loadZXing(): Promise<any> {
  if (zxingPromise) return zxingPromise;
  zxingPromise = new Promise((resolve, reject) => {
    if (window.ZXing) { resolve(window.ZXing); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
    s.onload = () => resolve(window.ZXing);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return zxingPromise;
}

async function decodeImageFile(file: File): Promise<string | null> {
  try {
    const ZXing = await loadZXing();
    const reader = new ZXing.BrowserMultiFormatReader();
    const url = URL.createObjectURL(file);
    try {
      const result = await reader.decodeFromImageUrl(url);
      return result?.getText() || null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

export default function BarcodeInput({ value, onChange, placeholder, autoFocus, onEnter }: Props) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
    // Preload ZXing in background
    void loadZXing().catch(() => {});
  }, [autoFocus]);

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const result = await decodeImageFile(file);
      if (result) {
        onChange(result);
        if (onEnter) setTimeout(onEnter, 100);
      } else {
        setError("No barcode found in image — try again or type manually");
      }
    } catch {
      setError("Could not read image — try again or type manually");
    } finally {
      setScanning(false);
      // Reset file input so same image can be re-captured
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Hidden file input that opens camera */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleCapture}
        />

        {/* Camera button */}
        <button
          type="button"
          onClick={() => { setError(null); cameraRef.current?.click(); }}
          disabled={scanning}
          style={{
            flexShrink: 0, height: 42, padding: "0 14px",
            background: scanning ? "rgba(129,140,248,0.08)" : "rgba(129,140,248,0.15)",
            border: "1px solid rgba(129,140,248,0.4)",
            borderRadius: 10, color: "#c7d2fe",
            fontSize: 13, fontWeight: 700,
            cursor: scanning ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 6,
            transition: "all 0.15s",
          }}>
          {scanning
            ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /><span>Reading…</span></>
            : <><span style={{ fontSize: 18 }}>📷</span><span>Scan</span></>
          }
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          className="input"
          value={value}
          onChange={e => { onChange(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } }}
          placeholder={placeholder || "Or type serial / asset tag…"}
          style={{ flex: 1, fontFamily: value ? "monospace" : undefined }}
        />
      </div>

      {/* Decoded value preview */}
      {value && (
        <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", paddingLeft: 2 }}>
          ↳ {value}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: "#fcd34d", display: "flex", alignItems: "center", gap: 6 }}>
          <span>⚠</span> {error}
        </div>
      )}
    </div>
  );
}
