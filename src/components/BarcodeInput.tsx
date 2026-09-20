/**
 * BarcodeInput — serial/barcode input with AI-powered label reading.
 *
 * Take a photo of any equipment label → Claude reads the serial number.
 * Works on damaged barcodes, printed text, any label format.
 * Falls back to manual text entry.
 */
import React, { useRef, useState, useEffect } from "react";

async function extractSerialFromImage(file: File): Promise<{ serial: string | null; candidates: string[]; raw: string }> {
  // Convert image to base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:image/...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `This is an equipment label from a lighting/audio/video fixture. 
Extract the serial number from this label.

Rules:
- Look for text labeled "Serial No", "S/N", "Serial Number", "SN", or similar
- Also look for barcodes — the number printed under the barcode is often the serial
- Return ONLY the serial number value, nothing else
- If you see multiple candidates, return the most likely serial number first
- If you cannot find a serial number, return "NOT_FOUND"
- Do not include the label text like "Serial No:" — just the value itself

Reply with JSON only: {"serial": "VALUE_OR_NULL", "candidates": ["list", "of", "all", "possible", "serials"], "note": "brief explanation"}`
          }
        ]
      }]
    })
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || "";

  try {
    // Strip markdown fences if present
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      serial: parsed.serial === "NOT_FOUND" ? null : parsed.serial || null,
      candidates: parsed.candidates || [],
      raw: parsed.note || "",
    };
  } catch {
    // Claude returned plain text — try to extract
    const match = text.match(/[A-Z0-9]{6,}/);
    return { serial: match ? match[0] : null, candidates: [], raw: text };
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
