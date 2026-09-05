import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

// Leaflet loaded from CDN — types declared minimally
declare const L: any;

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  return res.json();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function XmasTickets() {
  const [tickets, setTickets]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<"all" | "open" | "fixed">("all");
  const [search, setSearch]     = useState("");
  const [mapReady, setMapReady] = useState(false);
  const mapRef   = useRef<HTMLDivElement>(null);
  const leafletMap   = useRef<any>(null);
  const markerLayer  = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Load Leaflet CSS + JS once
  useEffect(() => {
    if (document.getElementById("leaflet-css")) { setMapReady(true); return; }
    const css = document.createElement("link");
    css.id = "leaflet-css";
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/xmas-list-tickets");
      setTickets(res.tickets || []);
    } finally { setLoading(false); }
  }

  // Init map when Leaflet is ready and container exists
  useEffect(() => {
    if (!mapReady || !mapRef.current || leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current).setView([28.41, -81.46], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap contributors"
    }).addTo(leafletMap.current);
    markerLayer.current = L.layerGroup().addTo(leafletMap.current);
  }, [mapReady]);

  // Update markers when tickets or filter changes
  useEffect(() => {
    if (!leafletMap.current || !markerLayer.current) return;
    markerLayer.current.clearLayers();
    const toShow = tickets.filter(t => (filter === "all" || t.status === filter) && t.lat != null && t.lon != null);
    const bounds: any[] = [];
    toShow.forEach(t => {
      const color = t.status === "fixed" ? "#34d399" : "#f87171";
      const marker = L.circleMarker([t.lat, t.lon], { radius: 9, weight: 2, color, fillColor: color, fillOpacity: 0.85 });
      marker.bindPopup(`<strong>#${t.id} — ${t.location_friendly}</strong><br/>${t.tech_name}<br/><a href="/christmas/${t.id}">View ticket</a>`);
      marker.addTo(markerLayer.current);
      bounds.push([t.lat, t.lon]);
    });
    if (bounds.length > 0) leafletMap.current.fitBounds(bounds, { padding: [40, 40] });
  }, [tickets, filter, mapReady]);

  const filtered = tickets.filter(t => {
    if (filter !== "all" && t.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (t.location_friendly || "").toLowerCase().includes(q) ||
             (t.tech_name || "").toLowerCase().includes(q) ||
             (t.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  const openCount  = tickets.filter(t => t.status === "open").length;
  const fixedCount = tickets.filter(t => t.status === "fixed").length;

  function focusOnMap(t: any) {
    if (!leafletMap.current || t.lat == null || t.lon == null) return;
    leafletMap.current.setView([t.lat, t.lon], 18);
    setSelectedId(t.id);
  }

  return (
    <div className="page fade-up">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div className="page-title">🎄 Christmas Tickets</div>
          <div className="page-subtitle" style={{ marginBottom: 0 }}>
            <span style={{ color: "#f87171", fontWeight: 600 }}>{openCount} open</span>
            <span className="dot">·</span>
            <span style={{ color: "#34d399" }}>{fixedCount} fixed</span>
            <span className="dot">·</span>
            {tickets.length} total
          </div>
        </div>
        <Link to="/christmas/new" className="btn primary small">+ New Ticket</Link>
      </div>

      {/* Map */}
      <div className="card" style={{ overflow: "hidden", marginBottom: 12, padding: 0 }}>
        <div ref={mapRef} style={{ height: 280, width: "100%", background: "#0d0f1a" }} />
        {!mapReady && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0f1a" }}>
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          </div>
        )}
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input className="input" placeholder="Search tickets…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <div style={{ display: "flex", gap: 5 }}>
          {(["all", "open", "fixed"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`btn small${filter === f ? " primary" : ""}`}>
              {f === "all" ? "All" : f === "open" ? "Open" : "Fixed"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎄</div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>
            {search ? `No tickets matching "${search}"` : `No ${filter === "all" ? "" : filter} tickets`}
          </div>
        </div>
      ) : (
        <div className="cards">
          {filtered.map(t => (
            <div key={t.id} style={{ textDecoration: "none" }}>
              <div
                className="item-card"
                style={{ borderColor: selectedId === t.id ? "var(--primary)" : undefined }}
                onClick={() => focusOnMap(t)}
              >
                <div className="item-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="item-title">
                      #{t.id} — {t.location_friendly}
                      {t.lat != null && <span style={{ fontSize: 10, marginLeft: 6, color: "var(--muted2)" }}>📍</span>}
                    </div>
                    <div className="item-sub" style={{ marginTop: 3 }}>
                      👤 {t.tech_name}<span className="dot">·</span>{fmtDate(t.created_at)}
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                      background: t.status === "fixed" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
                      color: t.status === "fixed" ? "#34d399" : "#f87171",
                      border: `1px solid ${t.status === "fixed" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                    }}>
                      {t.status === "fixed" ? "✓ Fixed" : "Open"}
                    </span>
                    <Link to={`/christmas/${t.id}`} onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: "var(--primary2)", textDecoration: "none" }}>
                      View →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
