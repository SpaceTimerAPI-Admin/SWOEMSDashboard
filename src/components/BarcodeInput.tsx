/**
 * BarcodeInput — serial/barcode input with photo-based label reading.
 *
 * Tap "📷 Scan" → device file picker opens (on mobile: "Take Photo" or
 * "Choose from Library"). The selected image is sent to Claude via
 * /api/inventory-read-label. Claude returns candidate values; the user
 * taps the correct one (or types manually).
 *
 * No live camera view, no BarcodeDetector dependency.
 */
import React, { useRef, useState, useEffect } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

interface VisionResult {
  serial: string | null;
  candidates: string[];
  note: string;
}

// ── Candidate picker modal ────────────────────────────────────────────────────
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
  const all = Array.from(
    new Set([...(result.serial ? [result.serial] : []), ...result.candidates])
  ).filter(Boolean);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        background: "#1a1b26", borderRadius: 16, padding: 22,
        maxWidth: 360, width: "100%",
        border: "1px solid rgba(255,255,255,0.12)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
          Select the correct value
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.5 }}>
          {result.note || "Claude found these values on the label — tap the serial number."}
        </div>

        {all.length === 0 ? (
          <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>
            No values found. Try a clearer photo with better lighting.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {all.map((v, i) => (
              <button
                key={i}
                onClick={() => onPick(v)}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 10,
                  textAlign: "left",
                  background: i === 0 ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${i === 0 ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: i === 0 ? "#c7d2fe" : "#e2e8f0",
                  fontSize: 14, fontFamily: "monospace",
                  fontWeight: i === 0 ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                {i === 0 && (
                  <span style={{ fontSize: 9, fontFamily: "sans-serif", fontWeight: 600, marginRight: 8, opacity: 0.7, letterSpacing: "0.05em" }}>
                    BEST MATCH
                  </span>
                )}
                {v}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onRetry}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            📷 Retake
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Type manually
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function BarcodeInput({ value, onChange, placeholder, autoFocus, onEnter }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const [reading, setReading]           = useState(false);
  const [readError, setReadError]       = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  // Convert file → base64 (strips data URI prefix)
  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // strip "data:image/jpeg;base64," prefix
        resolve(result.replace(/^data:[^;]+;base64,/, ""));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected after a retry
    e.target.value = "";

    setReading(true);
    setReadError(null);
    setVisionResult(null);

    try {
      const base64   = await toBase64(file);
      const mimeType = file.type || "image/jpeg";

      const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
      const res = await fetch("/api/inventory-read-label", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64, mediaType: mimeType }),
      });
      const data = await res.json();

      if (!data.ok) {
        setReadError(data.error || "Could not read label — try a clearer photo.");
        return;
      }

      const all = Array.from(
        new Set([...(data.serial ? [data.serial] : []), ...(data.candidates || [])])
      ).filter(Boolean);

      if (all.length === 0) {
        setReadError("No serial number found. Try a closer, clearer photo or type it manually.");
        return;
      }

      // Auto-select if only one candidate
      if (all.length === 1) {
        onChange(all[0]);
        if (onEnter) setTimeout(onEnter, 150);
        return;
      }

      setVisionResult({ serial: data.serial, candidates: data.candidates || [], note: data.note || "" });
    } catch (err: any) {
      setReadError(err?.message || "Failed to read label.");
    } finally {
      setReading(false);
    }
  }

  function handlePick(val: string) {
    setVisionResult(null);
    onChange(val);
    if (onEnter) setTimeout(onEnter, 150);
  }

  function handleRetry() {
    setVisionResult(null);
    fileRef.current?.click();
  }

  return (
    <>
      {/* Hidden file input — accept images, capture=environment hints mobile to use rear camera */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Camera / photo button */}
          <button
            type="button"
            onClick={() => { setReadError(null); fileRef.current?.click(); }}
            disabled={reading}
            style={{
              flexShrink: 0, height: 42, padding: "0 14px",
              background: "rgba(129,140,248,0.15)",
              border: "1px solid rgba(129,140,248,0.4)",
              borderRadius: 10, color: "#c7d2fe",
              fontSize: 13, fontWeight: 700, cursor: reading ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              opacity: reading ? 0.6 : 1,
            }}
          >
            {reading ? (
              <span className="spinner" style={{ width: 16, height: 16, borderColor: "#818cf8", borderTopColor: "transparent" }} />
            ) : (
              <span style={{ fontSize: 18 }}>📷</span>
            )}
            <span>{reading ? "Reading…" : "Scan"}</span>
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

        {/* Inline error */}
        {readError && (
          <div style={{ fontSize: 12, color: "#f87171", padding: "6px 10px", background: "rgba(248,113,113,0.08)", borderRadius: 6, border: "1px solid rgba(248,113,113,0.2)" }}>
            ⚠ {readError}
          </div>
        )}
      </div>

      {/* Candidate picker modal */}
      {visionResult && (
        <CandidatePicker
          result={visionResult}
          onPick={handlePick}
          onRetry={handleRetry}
          onClose={() => setVisionResult(null)}
        />
      )}
    </>
  );
}
