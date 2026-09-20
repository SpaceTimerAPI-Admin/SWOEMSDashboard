import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BarcodeInput from "../components/BarcodeInput";

const CATEGORIES = ["Lighting", "Sound", "Video", "Rides", "Other"];

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return res.json();
}

// Inline camera scanner for serial field
function CameraButton({ onScan }: { onScan: (val: string) => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const rafRef    = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function startCamera() {
    setError(null);
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      await new Promise(r => setTimeout(r, 100));
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }

      if (!("BarcodeDetector" in window)) { setError("Camera scanning requires Chrome or Safari 17.4+"); return; }
      const detector = new (window as any).BarcodeDetector({ formats: ["code_128","code_39","ean_13","ean_8","qr_code","upc_a","upc_e"] });
      let active = true;
      async function detect() {
        if (!active) return;
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const codes = await detector.detect(videoRef.current).catch(() => []);
          if (codes.length > 0) {
            active = false;
            stop();
            onScan(codes[0].rawValue);
            return;
          }
        }
        rafRef.current = requestAnimationFrame(detect);
      }
      rafRef.current = requestAnimationFrame(detect);
    } catch (e: any) {
      setError(e?.message?.includes("Permission") ? "Camera permission denied." : `Camera error: ${e?.message}`);
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={startCamera}
        style={{ background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 8, color: "#c7d2fe", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px 12px", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        📷 Scan
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "#000", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>📷 Point at barcode</div>
            <button onClick={stop} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "6px 14px" }}>Cancel</button>
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {error && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ background: "rgba(0,0,0,0.85)", borderRadius: 12, padding: 20, textAlign: "center", color: "#f87171", fontSize: 13 }}>{error}</div>
              </div>
            )}
            {!error && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ width: 260, height: 140, border: "2px solid rgba(129,140,248,0.6)", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function InventoryNew() {
  const nav = useNavigate();
  const [name, setName]             = useState("");
  const [serial, setSerial]         = useState("");
  const [category, setCategory]     = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel]           = useState("");
  const [location, setLocation]     = useState("Shop");
  const [vendor, setVendor]         = useState("");
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const serialRef = useRef<HTMLInputElement>(null);

  // Barcode scanner — many scanners act as keyboard input followed by Enter
  function onSerialKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Move focus to name if empty
      if (!name) document.getElementById("inv-name")?.focus();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Item name is required");
    if (!category) return setError("Category is required");

    setSaving(true);
    try {
      const res = await apiFetch("/api/inventory-create", {
        method: "POST",
        body: JSON.stringify({ name, serial_number: serial, category_name: category, manufacturer, model, location, vendor, notes }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to create");
      nav(`/inventory/${res.item.id}`);
    } catch (err: any) {
      setError(err?.message || "Failed to create item");
    } finally { setSaving(false); }
  }

  return (
    <div className="page fade-up">
      <div className="back-link" style={{ cursor: "pointer" }} onClick={() => nav(-1)}>← Inventory</div>
      <div className="page-title">Add Inventory Item</div>
      <div className="page-subtitle">Leave serial number blank to auto-generate an asset tag.</div>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Serial / barcode — first so scanner workflow works */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>
            Asset Identification
          </div>
          <label>
            <div className="field-label">Serial Number / Barcode</div>
            <BarcodeInput
              value={serial}
              onChange={setSerial}
              placeholder="Type serial, or tap Scan to use camera"
              autoFocus
              onEnter={() => document.getElementById("inv-name")?.focus()}
            />
            <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 5 }}>
              {serial ? `Will use: ${serial}` : "No serial? An asset tag (SWO-2026-XXXX) will be generated automatically"}
            </div>
          </label>
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 10 }}>
            Item Details
          </div>

          <label>
            <div className="field-label">Name <span style={{ color: "var(--danger)" }}>*</span></div>
            <input id="inv-name" className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder='e.g. "LED Par Can 64", "JBL SRX 800"' />
          </label>

          <div style={{ marginTop: 10 }}>
            <div className="field-label">Category <span style={{ color: "var(--danger)" }}>*</span></div>
            <div className="tag-row">
              {CATEGORIES.map(c => (
                <button key={c} type="button" className={`tag-btn${category === c ? " active" : ""}`} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <label style={{ flex: 1 }}>
              <div className="field-label">Manufacturer</div>
              <input className="input" value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="e.g. Chauvet, JBL" />
            </label>
            <label style={{ flex: 1 }}>
              <div className="field-label">Model</div>
              <input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. SlimPAR 56" />
            </label>
          </div>

          <label style={{ marginTop: 10 }}>
            <div className="field-label">Current Location</div>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Shop, Main Gate Storage" />
          </label>

          <label style={{ marginTop: 10 }}>
            <div className="field-label">Vendor / Supplier</div>
            <input className="input" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. B&H, Guitar Center" />
          </label>

          <label style={{ marginTop: 10 }}>
            <div className="field-label">Notes</div>
            <textarea className="textarea" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Condition, purchase info, any relevant details…" style={{ minHeight: 60 }} />
          </label>
        </div>

        {error && (
          <div style={{ background: "var(--danger-bg)", border: "1px solid rgba(255,84,84,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FFB0B0" }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={saving} className="btn primary" style={{ width: "100%" }}>
          {saving ? <><span className="spinner" style={{ marginRight: 6 }} /> Saving…</> : "Add to Inventory"}
        </button>
      </form>
    </div>
  );
}
