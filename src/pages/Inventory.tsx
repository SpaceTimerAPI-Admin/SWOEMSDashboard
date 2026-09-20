import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BarcodeInput from "../components/BarcodeInput";

const CATEGORIES = ["Lighting", "Sound", "Video", "Rides", "Other"];
const STATUSES = [
  { value: "in_storage",  label: "In Storage",   color: "#6ee7b7", bg: "rgba(52,211,153,0.15)"  },
  { value: "checked_out", label: "Checked Out",  color: "#fcd34d", bg: "rgba(251,191,36,0.15)"  },
  { value: "deployed",    label: "Deployed",     color: "#818cf8", bg: "rgba(129,140,248,0.15)" },
  { value: "in_repair",   label: "In Repair",    color: "#f87171", bg: "rgba(248,113,113,0.15)" },
  { value: "retired",     label: "Retired",      color: "#6b7280", bg: "rgba(107,114,128,0.15)" },
];

function statusStyle(status: string) {
  const s = STATUSES.find(x => x.value === status);
  return s ? { color: s.color, background: s.bg, border: `1px solid ${s.color}44` } : {};
}

function statusLabel(status: string) {
  return STATUSES.find(x => x.value === status)?.label || status;
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return res.json();
}

export default function Inventory() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  // Scan to find
  const [scanSerial, setScanSerial] = useState("");
  const [scanLooking, setScanLooking] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  async function handleScanLookup() {
    const serial = scanSerial.trim();
    if (!serial) return;
    setScanLooking(true); setScanError(null);
    try {
      const token = localStorage.getItem("md_session_token") || "";
      const res = await fetch(`/api/inventory-lookup?serial=${encodeURIComponent(serial)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.found && data.item) {
        nav(`/inventory/${data.item.id}`);
      } else {
        setScanError(`Serial "${serial}" not found — add it as a new item?`);
      }
    } finally { setScanLooking(false); }
  }

  useEffect(() => { void load(); }, [filterStatus, filterCat]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set("status", filterStatus);
      if (filterCat)    qs.set("category", filterCat);
      const res = await apiFetch(`/api/inventory-list?${qs}`);
      setItems(res.items || []);
    } finally { setLoading(false); }
  }

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [i.name, i.asset_tag, i.serial_number, i.manufacturer, i.model, i.location]
      .some(v => v && String(v).toLowerCase().includes(q));
  });

  // Counts per status
  const counts = STATUSES.reduce((acc, s) => {
    acc[s.value] = items.filter(i => i.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  const activeFilters = [filterStatus, filterCat].filter(Boolean).length;

  return (
    <div className="page fade-up">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div>
          <div className="page-title">Inventory</div>
          <div className="page-subtitle">{items.length} assets tracked</div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <Link to="/inventory/new" className="btn primary small">+ Add Item</Link>
          <Link to="/inventory/import" className="btn small">Import</Link>
        </div>
      </div>

      {/* Scan to find — prominent at the top */}
      <div style={{ marginBottom: 14, background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#c7d2fe", marginBottom: 8 }}>
          📦 Find by Serial / Barcode
        </div>
        <BarcodeInput
          value={scanSerial}
          onChange={val => { setScanSerial(val); setScanError(null); }}
          placeholder="Scan or type a serial number…"
          onEnter={handleScanLookup}
        />
        {scanSerial.trim() && (
          <button onClick={handleScanLookup} disabled={scanLooking} className="btn primary small" style={{ marginTop: 8, width: "100%" }}>
            {scanLooking ? <><span className="spinner" style={{ marginRight: 6 }} />Looking up…</> : "Find Item"}
          </button>
        )}
        {scanError && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#fcd34d" }}>
            ⚠ {scanError} <Link to="/inventory/new" style={{ color: "#c7d2fe", marginLeft: 6 }}>+ Add new item →</Link>
          </div>
        )}
      </div>

      {/* Status summary chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {STATUSES.filter(s => counts[s.value] > 0).map(s => (
          <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? "" : s.value)}
            style={{ padding: "4px 11px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
              background: filterStatus === s.value ? s.bg : "rgba(255,255,255,0.05)",
              color: filterStatus === s.value ? s.color : "var(--muted)",
              borderColor: filterStatus === s.value ? `${s.color}55` : "var(--border)" }}>
            {s.label} · {counts[s.value]}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input className="input" placeholder="Search by name, serial, location…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        <button onClick={() => setShowFilter(v => !v)} style={{
          padding: "9px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
          border: "1px solid", transition: "all 0.15s", whiteSpace: "nowrap",
          borderColor: activeFilters ? "rgba(129,140,248,0.5)" : "var(--border)",
          background: activeFilters ? "rgba(129,140,248,0.12)" : "rgba(255,255,255,0.05)",
          color: activeFilters ? "#c7d2fe" : "var(--muted)",
        }}>
          ⚙ Filter{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>

      {showFilter && (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 7 }}>Category</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ display: "flex", gap: 8, cursor: "pointer", alignItems: "center" }}>
                  <input type="radio" checked={filterCat === ""} onChange={() => setFilterCat("")} style={{ accentColor: "var(--primary)" }} />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>All</span>
                </label>
                {CATEGORIES.map(c => (
                  <label key={c} style={{ display: "flex", gap: 8, cursor: "pointer", alignItems: "center" }}>
                    <input type="radio" checked={filterCat === c} onChange={() => setFilterCat(c)} style={{ accentColor: "var(--primary)" }} />
                    <span style={{ fontSize: 13, color: filterCat === c ? "var(--text)" : "var(--muted)" }}>{c}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 7 }}>Status</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ display: "flex", gap: 8, cursor: "pointer", alignItems: "center" }}>
                  <input type="radio" checked={filterStatus === ""} onChange={() => setFilterStatus("")} style={{ accentColor: "var(--primary)" }} />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>All</span>
                </label>
                {STATUSES.map(s => (
                  <label key={s.value} style={{ display: "flex", gap: 8, cursor: "pointer", alignItems: "center" }}>
                    <input type="radio" checked={filterStatus === s.value} onChange={() => setFilterStatus(s.value)} style={{ accentColor: "var(--primary)" }} />
                    <span style={{ fontSize: 13, color: filterStatus === s.value ? s.color : "var(--muted)" }}>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          {activeFilters > 0 && (
            <button onClick={() => { setFilterStatus(""); setFilterCat(""); }}
              style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 32 }}><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>{search ? `No items matching "${search}"` : "No inventory items yet"}</div>
          {!search && <Link to="/inventory/new" className="btn primary small" style={{ marginTop: 12, display: "inline-flex" }}>Add first item</Link>}
        </div>
      ) : (
        <div className="cards">
          {filtered.map(item => (
            <Link key={item.id} to={`/inventory/${item.id}`} className="item-card" style={{ textDecoration: "none" }}>
              <div className="item-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="item-title">{item.name}</div>
                  <div className="item-sub" style={{ marginTop: 2 }}>
                    {item.manufacturer && <span>{item.manufacturer}</span>}
                    {item.model && <><span className="dot">·</span><span>{item.model}</span></>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 3 }}>
                    <span style={{ fontFamily: "monospace" }}>{item.asset_tag}</span>
                    {item.location && <><span className="dot">·</span><span>📍 {item.location}</span></>}
                    {item.status === "checked_out" && item.checked_out_to_name && <><span className="dot">·</span><span>👤 {item.checked_out_to_name}</span></>}
                    {item.status === "deployed" && item.deployed_by_name && <><span className="dot">·</span><span>Deployed by {item.deployed_by_name}</span></>}
                  </div>
                </div>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99, ...statusStyle(item.status) }}>
                    {statusLabel(item.status)}
                  </span>
                  {item.category_name && (
                    <span style={{ fontSize: 10, color: "var(--muted2)" }}>{item.category_name}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
