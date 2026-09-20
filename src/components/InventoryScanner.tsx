/**
 * InventoryScanner — fullscreen inventory lookup modal.
 * Used from the office dashboard "Inventory" button.
 * Supports barcode scan (camera), manual serial entry, and text search.
 * No auth required — uses public /api/inventory-lookup endpoint.
 */
import React, { useEffect, useRef, useState } from "react";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  in_storage:  { label: "In Storage",   color: "#6ee7b7", bg: "rgba(52,211,153,0.15)"  },
  checked_out: { label: "Checked Out",  color: "#fcd34d", bg: "rgba(251,191,36,0.15)"  },
  deployed:    { label: "Deployed",     color: "#818cf8", bg: "rgba(129,140,248,0.15)" },
  in_repair:   { label: "In Repair",    color: "#f87171", bg: "rgba(248,113,113,0.15)" },
  retired:     { label: "Retired",      color: "#6b7280", bg: "rgba(107,114,128,0.15)" },
};

type Props = { onClose: () => void };

async function lookupSerial(serial: string) {
  const res = await fetch(`/api/inventory-lookup?serial=${encodeURIComponent(serial)}`);
  return res.json();
}

async function searchItems(q: string) {
  const res = await fetch(`/api/inventory-lookup?q=${encodeURIComponent(q)}`);
  return res.json();
}

async function createItem(payload: any) {
  const res = await fetch("/api/inventory-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export default function InventoryScanner({ onClose }: Props) {
  const [mode, setMode] = useState<"scan" | "search" | "result" | "new">("scan");
  const [serialInput, setSerialInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [looking, setLooking] = useState(false);
  const [item, setItem] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [scannedSerial, setScannedSerial] = useState("");

  // New item form
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newManuf, setNewManuf] = useState("");
  const [newCategory, setNewCategory] = useState("Lighting");
  const [newLocation, setNewLocation] = useState("Shop");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const serialRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<any>(null);

  useEffect(() => {
    if (mode === "scan") setTimeout(() => serialRef.current?.focus(), 100);
    if (mode === "search") setTimeout(() => searchRef.current?.focus(), 100);
  }, [mode]);

  // Auto-search as user types
  useEffect(() => {
    if (!searchInput.trim() || searchInput.length < 2) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchItems(searchInput);
        setSearchResults(res.items || []);
      } finally { setSearching(false); }
    }, 300);
  }, [searchInput]);

  async function handleSerialSubmit(e: React.FormEvent) {
    e.preventDefault();
    const serial = serialInput.trim();
    if (!serial) return;
    setLooking(true);
    setNotFound(false);
    try {
      const res = await lookupSerial(serial);
      if (res.found && res.item) {
        setItem(res.item);
        setMode("result");
      } else {
        // Not found — prompt to create
        setScannedSerial(serial);
        setMode("new");
      }
    } finally { setLooking(false); }
  }

  function selectSearchResult(i: any) {
    setItem(i);
    setMode("result");
    setSearchInput("");
    setSearchResults([]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return setSaveError("Name is required");
    setSaving(true); setSaveError(null);
    try {
      const res = await createItem({
        serial_number: scannedSerial || undefined,
        name: newName.trim(),
        manufacturer: newManuf.trim() || undefined,
        model: newModel.trim() || undefined,
        category_name: newCategory,
        location: newLocation.trim() || "Shop",
      });
      if (!res.ok) throw new Error(res.error || "Failed to create");
      setItem(res.item);
      setMode("result");
    } catch (err: any) {
      setSaveError(err?.message || "Failed to create item");
    } finally { setSaving(false); }
  }

  function reset() {
    setMode("scan");
    setSerialInput("");
    setSearchInput("");
    setItem(null);
    setNotFound(false);
    setScannedSerial("");
    setNewName(""); setNewModel(""); setNewManuf("");
    setSaveError(null);
  }

  const sm = item ? (STATUS_META[item.status] || { label: item.status, color: "#9ca3af", bg: "rgba(156,163,175,0.15)" }) : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 500, background: "#0f1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>

        {/* Header */}
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6" }}>📦 Inventory</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          {/* Mode tabs */}
          {mode !== "new" && (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {[["scan", "🔍 Scan / Serial"], ["search", "🔎 Search"]].map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m as any); setItem(null); setNotFound(false); }}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                    background: mode === m || (mode === "result" && m === "scan") ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.04)",
                    borderColor: mode === m || (mode === "result" && m === "scan") ? "rgba(129,140,248,0.35)" : "rgba(255,255,255,0.08)",
                    color: mode === m || (mode === "result" && m === "scan") ? "#c7d2fe" : "#6b7280" }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>

          {/* SCAN MODE */}
          {(mode === "scan") && (
            <form onSubmit={handleSerialSubmit}>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 10 }}>
                Scan a barcode or type a serial number / asset tag
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input ref={serialRef} className="input" value={serialInput}
                  onChange={e => setSerialInput(e.target.value)}
                  placeholder="Serial number or asset tag…"
                  style={{ flex: 1, fontFamily: serialInput ? "monospace" : undefined }} />
                <button type="submit" disabled={looking || !serialInput.trim()} className="btn primary small">
                  {looking ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "Look up"}
                </button>
              </div>
            </form>
          )}

          {/* SEARCH MODE */}
          {mode === "search" && (
            <div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 10 }}>
                Search by name, manufacturer, model, or location
              </div>
              <input ref={searchRef} className="input" value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="e.g. Elation SixPar, Main Gate, ETC D40…" />
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {searching && <div style={{ fontSize: 12, color: "#6b7280" }}>Searching…</div>}
                {!searching && searchInput.length >= 2 && searchResults.length === 0 && (
                  <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center", padding: "16px 0" }}>No items found</div>
                )}
                {searchResults.map(i => {
                  const s = STATUS_META[i.status] || STATUS_META.in_storage;
                  return (
                    <div key={i.id} onClick={() => selectSearchResult(i)}
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                          {i.asset_tag && <span style={{ fontFamily: "monospace" }}>{i.asset_tag}</span>}
                          {i.location && <span style={{ marginLeft: 8 }}>📍 {i.location}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, flexShrink: 0, background: s.bg, color: s.color }}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RESULT */}
          {mode === "result" && item && sm && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6" }}>{item.name}</div>
                  {item.model && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{item.manufacturer} · {item.model}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 11px", borderRadius: 99, flexShrink: 0, background: sm.bg, color: sm.color, border: `1px solid ${sm.color}44` }}>
                  {sm.label}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", marginBottom: 14 }}>
                {[
                  { label: "Asset Tag", value: item.asset_tag, mono: true },
                  { label: "Serial #",  value: item.serial_number, mono: true },
                  { label: "Category",  value: item.category_name },
                  { label: "Location",  value: item.location },
                  item.status === "checked_out" && { label: "With",    value: item.checked_out_to_name },
                  item.status === "deployed"    && { label: "Deployed to", value: item.deployed_to },
                  item.status === "deployed"    && { label: "By",       value: item.deployed_by_name },
                ].filter(Boolean).map((f: any) => f.value ? (
                  <div key={f.label}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#4b5563" }}>{f.label}</div>
                    <div style={{ fontSize: 13, color: "#e5e7eb", marginTop: 2, fontFamily: f.mono ? "monospace" : undefined }}>{f.value}</div>
                  </div>
                ) : null)}
              </div>

              {item.notes && (
                <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 14 }}>
                  {item.notes}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={reset} className="btn small">🔍 Scan Another</button>
                <a href={`/inventory/${item.id}`} target="_blank" rel="noreferrer"
                  style={{ textDecoration: "none" }}
                  className="btn small">
                  View Full Record ↗
                </a>
              </div>
            </div>
          )}

          {/* NEW ITEM FORM */}
          {mode === "new" && (
            <form onSubmit={handleCreate}>
              <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#fcd34d", marginBottom: 14 }}>
                {scannedSerial
                  ? <>Serial <span style={{ fontFamily: "monospace" }}>{scannedSerial}</span> not found in inventory — add it now:</>
                  : "Add new item to inventory:"}
              </div>

              {scannedSerial && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#4b5563", marginBottom: 4 }}>Serial / Asset Tag</div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "#c7d2fe" }}>{scannedSerial}</div>
                </div>
              )}

              <label style={{ display: "block", marginBottom: 10 }}>
                <div className="field-label">Item Name <span style={{ color: "var(--danger)" }}>*</span></div>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder='e.g. "Elation SixPar 1000 IP"' autoFocus />
              </label>

              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <label style={{ flex: 1 }}>
                  <div className="field-label">Manufacturer</div>
                  <input className="input" value={newManuf} onChange={e => setNewManuf(e.target.value)} placeholder="e.g. Elation" />
                </label>
                <label style={{ flex: 1 }}>
                  <div className="field-label">Model</div>
                  <input className="input" value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="e.g. SixPar 1000" />
                </label>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div className="field-label">Category</div>
                <div className="tag-row">
                  {["Lighting","Sound","Video","Rides","Other"].map(c => (
                    <button key={c} type="button" className={`tag-btn${newCategory === c ? " active" : ""}`} onClick={() => setNewCategory(c)}>{c}</button>
                  ))}
                </div>
              </div>

              <label style={{ display: "block", marginBottom: 14 }}>
                <div className="field-label">Current Location</div>
                <input className="input" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g. Shop, Main Gate" />
              </label>

              {saveError && <div style={{ fontSize: 12, color: "#FFB0B0", marginBottom: 10 }}>⚠ {saveError}</div>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={saving} className="btn primary small">
                  {saving ? <><span className="spinner" style={{ marginRight: 6 }} />Adding…</> : "Add to Inventory"}
                </button>
                <button type="button" className="btn small" onClick={reset}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
