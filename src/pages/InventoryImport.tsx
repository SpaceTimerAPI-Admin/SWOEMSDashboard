import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return res.json();
}

const COLUMN_MAP: { field: string; label: string; aliases: string[] }[] = [
  { field: "name",         label: "Item Name",       aliases: ["name", "item", "description", "equipment"] },
  { field: "serial_number",label: "Serial Number",   aliases: ["serial", "serial_number", "sn", "serial #"] },
  { field: "category",     label: "Category",        aliases: ["category", "type", "cat"] },
  { field: "manufacturer", label: "Manufacturer",    aliases: ["manufacturer", "make", "brand", "mfr"] },
  { field: "model",        label: "Model",           aliases: ["model", "model_number", "model #"] },
  { field: "location",     label: "Location",        aliases: ["location", "loc", "where"] },
  { field: "notes",        label: "Notes",           aliases: ["notes", "note", "comments", "comment"] },
];

function autoMapColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const hl = h.toLowerCase().trim();
    const match = COLUMN_MAP.find(m => m.aliases.some(a => hl === a || hl.includes(a)));
    if (match && !mapping[match.field]) mapping[match.field] = h;
  }
  return mapping;
}

export default function InventoryImport() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<Record<string, string>[]>([]);
  const [headers, setHeaders]   = useState<string[]>([]);
  const [colMap, setColMap]     = useState<Record<string, string>>({});
  const [preview, setPreview]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<any>(null);
  const [error, setError]       = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setResult(null);

    try {
      // Dynamic import xlsx
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs" as any);
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });
      if (!json.length) { setError("No rows found in spreadsheet"); return; }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRows(json);
      const mapped = autoMapColumns(hdrs);
      setColMap(mapped);
      setPreview(json.slice(0, 5));
    } catch (err: any) {
      setError(`Failed to read file: ${err?.message || "unknown error"}`);
    }
  }

  async function runImport() {
    if (!rows.length) return;
    setLoading(true); setError(null); setResult(null);
    try {
      // Transform rows using column mapping
      const mapped = rows.map(row => {
        const out: Record<string, string> = {};
        for (const [field, header] of Object.entries(colMap)) {
          if (header && row[header] !== undefined) out[field] = String(row[header] || "").trim();
        }
        return out;
      }).filter(r => r.name); // skip rows with no name

      const res = await apiFetch("/api/inventory-import", {
        method: "POST",
        body: JSON.stringify({ rows: mapped }),
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Import failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="page fade-up">
      <div className="back-link" style={{ cursor: "pointer" }} onClick={() => nav(-1)}>← Inventory</div>
      <div className="page-title">Import from Excel</div>
      <div className="page-subtitle">Upload your existing spreadsheet to seed the inventory.</div>

      {/* Upload */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={onFile} />
        <button className="btn primary" onClick={() => fileRef.current?.click()}>📂 Choose spreadsheet (.xlsx / .xls / .csv)</button>
        <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 8 }}>
          Column headers will be auto-detected. Common names like "Name", "Serial", "Category", "Location" map automatically.
        </div>
      </div>

      {error && (
        <div style={{ background: "var(--danger-bg)", border: "1px solid rgba(255,84,84,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FFB0B0", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Column mapping */}
      {headers.length > 0 && !result && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 12 }}>
              Column Mapping — {rows.length} rows detected
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {COLUMN_MAP.map(f => (
                <div key={f.field} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 130, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{f.label}</div>
                  <select value={colMap[f.field] || ""} onChange={e => setColMap(m => ({ ...m, [f.field]: e.target.value }))}
                    style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12, padding: "6px 10px" }}>
                    <option value="">— skip —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && colMap.name && (
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 8 }}>
                Preview (first {preview.length} rows)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {preview.map((row, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "7px 10px", fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>{row[colMap.name] || "(no name)"}</span>
                    {colMap.serial_number && row[colMap.serial_number] && <span style={{ color: "var(--muted2)", marginLeft: 8, fontFamily: "monospace" }}>{row[colMap.serial_number]}</span>}
                    {colMap.category && row[colMap.category] && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· {row[colMap.category]}</span>}
                    {colMap.location && row[colMap.location] && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· 📍 {row[colMap.location]}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn primary" onClick={runImport} disabled={loading || !colMap.name} style={{ width: "100%" }}>
            {loading ? <><span className="spinner" style={{ marginRight: 6 }} /> Importing…</> : `Import ${rows.length} rows`}
          </button>
        </>
      )}

      {/* Result */}
      {result && (
        <div className="card" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
            Import complete
          </div>
          <div style={{ fontSize: 14, color: "#6ee7b7", marginBottom: 4 }}>
            {result.imported} items imported
          </div>
          {result.skipped > 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{result.skipped} skipped (already existed or missing name)</div>}
          {result.errors?.length > 0 && (
            <div style={{ fontSize: 12, color: "#f87171", marginTop: 8, textAlign: "left" }}>
              {result.errors.map((e: string, i: number) => <div key={i}>⚠ {e}</div>)}
            </div>
          )}
          <button className="btn primary" onClick={() => nav("/inventory")} style={{ marginTop: 16 }}>View Inventory</button>
        </div>
      )}
    </div>
  );
}
