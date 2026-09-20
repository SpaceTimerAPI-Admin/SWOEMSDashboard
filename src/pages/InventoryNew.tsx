import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const CATEGORIES = ["Lighting", "Sound", "Video", "Rides", "Other"];

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return res.json();
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
            <input ref={serialRef} className="input" value={serial} onChange={e => setSerial(e.target.value)}
              onKeyDown={onSerialKeyDown}
              placeholder="Scan barcode or type serial — leave blank to auto-generate"
              style={{ fontFamily: serial ? "monospace" : undefined }} />
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
