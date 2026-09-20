/**
 * BarcodeInput — serial/barcode input with AI-powered label reading.
 *
 * Take a photo of any equipment label → Claude reads the serial number.
 * Works on damaged barcodes, printed text, any label format.
 * Falls back to manual text entry.
 */
import React, { useRef, useState, useEffect } from "react";

async function extractSerialFromImage(file: File): Promise<{ serial: string | null; candidates: string[]; raw: string; note: string }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await fetch("/api/inventory-read-label", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: base64,
      mediaType: file.type || "image/jpeg",
    }),
  });

  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to read label");

  return {
    serial: data.serial || null,
    candidates: data.candidates || [],
    raw: data.note || "",
    note: data.note || "",
  };
}

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

export default function BarcodeInput({ value, onChange, placeholder, autoFocus, onEnter }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [status, setStatus]       = useState<"idle" | "reading" | "confirm" | "error">("idle");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [note, setNote]           = useState("");
  const [errorMsg, setErrorMsg]   = useState("");
  const [preview, setPreview]     = useState<string | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const url = URL.createObjectURL(file);
    setPreview(url);
    setStatus("reading");
    setErrorMsg("");
    setCandidates([]);

    try {
      const result = await extractSerialFromImage(file);

      if (result.serial) {
        // Auto-fill and show confirm
        onChange(result.serial);
        setCandidates(result.candidates.filter(c => c !== result.serial));
        setNote(result.note);
        setStatus("confirm");
      } else if (result.candidates.length > 0) {
        // Show candidates to pick from
        onChange(result.candidates[0]);
        setCandidates(result.candidates.slice(1));
        setNote(result.note || "Multiple values found — select the correct one");
        setStatus("confirm");
      } else {
        setNote(result.raw || "Could not find a serial number on this label");
        setStatus("error");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to read label");
      setStatus("error");
    } finally {
      URL.revokeObjectURL(url);
      setPreview(null);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function retry() {
    setStatus("idle");
    setErrorMsg("");
    setCandidates([]);
    setNote("");
    cameraRef.current?.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Main input row */}
      <div style={{ display: "flex", gap: 8 }}>
        {/* Hidden file input */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          style={{ display: "none" }} onChange={handleCapture} />

        {/* Scan button */}
        <button type="button"
          onClick={() => { setStatus("idle"); setErrorMsg(""); setCandidates([]); cameraRef.current?.click(); }}
          disabled={status === "reading"}
          style={{
            flexShrink: 0, height: 42, padding: "0 14px",
            background: status === "reading" ? "rgba(129,140,248,0.08)" : "rgba(129,140,248,0.15)",
            border: "1px solid rgba(129,140,248,0.4)", borderRadius: 10,
            color: "#c7d2fe", fontSize: 13, fontWeight: 700,
            cursor: status === "reading" ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
          {status === "reading"
            ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /><span>Reading…</span></>
            : <><span style={{ fontSize: 18 }}>📷</span><span>Scan Label</span></>
          }
        </button>

        {/* Text input */}
        <input ref={inputRef} className="input" value={value}
          onChange={e => { onChange(e.target.value); setStatus("idle"); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } }}
          placeholder={placeholder || "Or type serial / asset tag…"}
          style={{ flex: 1, fontFamily: value ? "monospace" : undefined }} />
      </div>

      {/* Reading state */}
      {status === "reading" && (
        <div style={{ fontSize: 12, color: "#818cf8", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
          Claude is reading the label…
        </div>
      )}

      {/* Confirm state — Claude found something */}
      {status === "confirm" && value && (
        <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 600, marginBottom: 6 }}>
            ✓ Serial found — confirm or edit below
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: "#e5e7eb", marginBottom: 8 }}>{value}</div>

          {/* Other candidates */}
          {candidates.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 5 }}>Other values found on label:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {candidates.map(c => (
                  <button key={c} type="button" onClick={() => onChange(c)}
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#9ca3af", fontSize: 11, fontFamily: "monospace", cursor: "pointer", padding: "3px 8px" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => { setStatus("idle"); if (onEnter) onEnter(); }}
              className="btn primary small">
              ✓ Use this serial
            </button>
            <button type="button" onClick={retry} className="btn small">
              📷 Retake
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 12, color: "#fcd34d", marginBottom: 8 }}>
            ⚠ {note || errorMsg || "Could not read serial number"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={retry} className="btn small">📷 Try Again</button>
            <span style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>or type manually above</span>
          </div>
        </div>
      )}
    </div>
  );
}
