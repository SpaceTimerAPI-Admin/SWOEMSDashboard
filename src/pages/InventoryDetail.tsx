import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProfile } from "../lib/auth";

const TZ = "America/New_York";
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  in_storage:   { label: "In Storage",   color: "#6ee7b7", bg: "rgba(52,211,153,0.15)" },
  checked_out:  { label: "Checked Out",  color: "#fcd34d", bg: "rgba(251,191,36,0.15)" },
  deployed:     { label: "Deployed",     color: "#818cf8", bg: "rgba(129,140,248,0.15)" },
  in_repair:    { label: "In Repair",    color: "#f87171", bg: "rgba(248,113,113,0.15)" },
  retired:      { label: "Retired",      color: "#6b7280", bg: "rgba(107,114,128,0.15)" },
};

const EVENT_META: Record<string, { label: string; icon: string }> = {
  received:              { label: "Received",             icon: "📦" },
  checked_out:           { label: "Checked Out",          icon: "👤" },
  checked_in:            { label: "Checked In",           icon: "↩️" },
  deployed:              { label: "Deployed",             icon: "🔧" },
  pulled:                { label: "Pulled from Service",  icon: "⬆️" },
  sent_to_repair:        { label: "Sent to Repair",       icon: "🔨" },
  returned_from_repair:  { label: "Returned from Repair", icon: "✅" },
  retired:               { label: "Retired",              icon: "🗃️" },
  note:                  { label: "Note",                 icon: "📝" },
};

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return res.json();
}

const EVENT_ACTIONS: { event_type: string; label: string; icon: string; locationLabel: string; locationPlaceholder: string; locationRequired: boolean; needsTakenBy?: boolean; needsVendor?: boolean; needsCondition?: boolean; statusFilter?: string[] }[] = [
  { event_type: "checked_out",          label: "Check Out",          icon: "👤", locationLabel: "Where is it going?",       locationPlaceholder: "e.g. Main Gate, Backstage",      locationRequired: true,  needsTakenBy: true,  statusFilter: ["in_storage"] },
  { event_type: "checked_in",           label: "Check In",           icon: "↩️", locationLabel: "Returned to",              locationPlaceholder: "e.g. Shop, Storage Room",        locationRequired: true,  needsCondition: true, statusFilter: ["checked_out"] },
  { event_type: "deployed",             label: "Deploy",             icon: "🔧", locationLabel: "Deploy location",           locationPlaceholder: "e.g. Mako Lift Tower, Stage L",  locationRequired: true,  statusFilter: ["in_storage", "checked_out"] },
  { event_type: "pulled",               label: "Pull from Service",  icon: "⬆️", locationLabel: "Returning to",             locationPlaceholder: "e.g. Shop, EMS Storage",         locationRequired: true,  needsCondition: true, statusFilter: ["deployed"] },
  { event_type: "sent_to_repair",       label: "Send to Repair",     icon: "🔨", locationLabel: "Repair location / vendor", locationPlaceholder: "e.g. Shop bench, B&H Service",   locationRequired: true,  needsVendor: true,    statusFilter: ["in_storage", "checked_out", "deployed"] },
  { event_type: "returned_from_repair", label: "Return from Repair", icon: "✅", locationLabel: "Returned to",              locationPlaceholder: "e.g. Shop, EMS Storage",         locationRequired: true,  needsCondition: true, statusFilter: ["in_repair"] },
  { event_type: "retired",              label: "Retire",             icon: "🗃️", locationLabel: "Final location / reason",  locationPlaceholder: "e.g. Dead stock, Written off",   locationRequired: false },
  { event_type: "note",                 label: "Add Note",           icon: "📝", locationLabel: "Current location",         locationPlaceholder: "Where is this item right now?",  locationRequired: false },
];

export default function InventoryDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const profile = getProfile();

  const [item, setItem]     = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Action form
  const [showAction, setShowAction] = useState(false);
  const [actionType, setActionType] = useState("");
  const [location, setLocation]     = useState("");
  const [takenBy, setTakenBy]       = useState(profile?.name || "");
  const [vendor, setVendor]         = useState("");
  const [condition, setCondition]   = useState("");
  const [note, setNote]             = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);

  useEffect(() => { if (id) void load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inventory-get?id=${id}`);
      if (res.ok) { setItem(res.item); setEvents(res.events || []); }
    } finally { setLoading(false); }
  }

  function openAction(type: string) {
    setActionType(type);
    setLocation(""); setVendor(""); setCondition(""); setNote(""); setActionError(null);
    setTakenBy(profile?.name || "");
    setShowAction(true);
  }

  async function submitAction(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    const meta = EVENT_ACTIONS.find(a => a.event_type === actionType);
    if (meta?.locationRequired && !location.trim()) return setActionError("Location is required");
    if (meta?.needsTakenBy && !takenBy.trim()) return setActionError("Person name is required");

    setActionSaving(true);
    try {
      const res = await apiFetch("/api/inventory-event", {
        method: "POST",
        body: JSON.stringify({ item_id: id, event_type: actionType, location, taken_by: takenBy, vendor, condition, note }),
      });
      if (!res.ok) throw new Error(res.error || "Failed");
      setItem(res.item);
      await load();
      setShowAction(false);
    } catch (err: any) {
      setActionError(err?.message || "Failed to log event");
    } finally { setActionSaving(false); }
  }

  if (loading) return <div className="page fade-up" style={{ textAlign: "center", paddingTop: 60 }}><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>;
  if (!item) return <div className="page fade-up"><div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Item not found.</div></div>;

  const sm = STATUS_META[item.status] || { label: item.status, color: "#9ca3af", bg: "rgba(156,163,175,0.15)" };
  const availableActions = EVENT_ACTIONS.filter(a => !a.statusFilter || a.statusFilter.includes(item.status));
  const selectedAction = EVENT_ACTIONS.find(a => a.event_type === actionType);

  return (
    <div className="page fade-up">
      <div className="back-link" style={{ cursor: "pointer" }} onClick={() => nav(-1)}>← Inventory</div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div className="page-title">{item.name}</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted2)", marginTop: 2 }}>{item.asset_tag}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 99, flexShrink: 0, alignSelf: "flex-start", color: sm.color, background: sm.bg, border: `1px solid ${sm.color}44` }}>
          {sm.label}
        </span>
      </div>

      {/* Details card */}
      <div className="card" style={{ padding: 16, marginBottom: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
          {[
            { label: "Category",    value: item.category_name },
            { label: "Manufacturer", value: item.manufacturer },
            { label: "Model",       value: item.model },
            { label: "Serial #",    value: item.serial_number },
            { label: "Location",    value: item.location },
            { label: "Vendor",      value: item.vendor },
          ].filter(f => f.value).map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted2)" }}>{f.label}</div>
              <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2 }}>{f.value}</div>
            </div>
          ))}
        </div>

        {/* Current custody info */}
        {item.status === "checked_out" && (
          <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <div style={{ fontSize: 12, color: "#fcd34d", fontWeight: 600 }}>👤 Checked out to {item.checked_out_to_name}</div>
            {item.checked_out_at && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 2 }}>{fmtDate(item.checked_out_at)} · {daysSince(item.checked_out_at)} days ago</div>}
          </div>
        )}
        {item.status === "deployed" && (
          <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)" }}>
            <div style={{ fontSize: 12, color: "#c7d2fe", fontWeight: 600 }}>🔧 Deployed to {item.deployed_to}</div>
            {item.deployed_by_name && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 2 }}>By {item.deployed_by_name} · {item.deployed_at ? fmtDate(item.deployed_at) : ""} · {item.deployed_at ? daysSince(item.deployed_at) + " days in field" : ""}</div>}
          </div>
        )}
        {item.notes && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>{item.notes}</div>
        )}
      </div>

      {/* Action buttons */}
      {item.status !== "retired" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {availableActions.map(a => (
            <button key={a.event_type} className="btn small" onClick={() => openAction(a.event_type)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Action form */}
      {showAction && (
        <div className="card" style={{ padding: 16, marginBottom: 14, border: "1px solid rgba(129,140,248,0.25)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            {selectedAction?.icon} {selectedAction?.label}
          </div>
          <form onSubmit={submitAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {selectedAction?.needsTakenBy && (
              <label>
                <div className="field-label">Person Checking Out <span style={{ color: "var(--danger)" }}>*</span></div>
                <input className="input" value={takenBy} onChange={e => setTakenBy(e.target.value)} placeholder="Who is taking this?" />
              </label>
            )}
            <label>
              <div className="field-label">
                {selectedAction?.locationLabel || "Location"}
                {selectedAction?.locationRequired && <span style={{ color: "var(--danger)" }}> *</span>}
              </div>
              <input className="input" value={location} onChange={e => setLocation(e.target.value)}
                placeholder={selectedAction?.locationPlaceholder || "Location…"} />
            </label>
            {selectedAction?.needsVendor && (
              <label>
                <div className="field-label">Vendor / Who's Doing the Repair</div>
                <input className="input" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Internal shop, Guitar Center Service" />
              </label>
            )}
            {selectedAction?.needsCondition && (
              <div>
                <div className="field-label">Condition</div>
                <div className="tag-row">
                  {[["good", "✓ Good"], ["needs_attention", "⚠ Needs Attention"], ["failed", "✗ Failed"]].map(([v, l]) => (
                    <button key={v} type="button" className={`tag-btn${condition === v ? " active" : ""}`} onClick={() => setCondition(v)}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <label>
              <div className="field-label">Note</div>
              <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional details…" style={{ minHeight: 50 }} />
            </label>
            {actionError && <div style={{ fontSize: 12, color: "#FFB0B0" }}>⚠ {actionError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={actionSaving} className="btn primary small">
                {actionSaving ? <span className="spinner" /> : "Confirm"}
              </button>
              <button type="button" className="btn small" onClick={() => setShowAction(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Event history */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 12 }}>
          History ({events.length})
        </div>
        {events.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No events yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {events.map((ev: any, i: number) => {
              const em = EVENT_META[ev.event_type] || { label: ev.event_type, icon: "•" };
              return (
                <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: i < events.length - 1 ? 12 : 0, marginBottom: i < events.length - 1 ? 12 : 0, borderBottom: i < events.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{em.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{em.label}</span>
                      <span style={{ fontSize: 11, color: "var(--muted2)", flexShrink: 0 }}>{fmtDate(ev.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      {ev.performed_by_name && <span>By {ev.performed_by_name}</span>}
                      {ev.taken_by && ev.taken_by !== ev.performed_by_name && <span> → {ev.taken_by}</span>}
                      {ev.location && <span> · 📍 {ev.location}</span>}
                      {ev.vendor && <span> · 🔨 {ev.vendor}</span>}
                      {ev.condition && <span> · {ev.condition === "good" ? "✓ Good" : ev.condition === "needs_attention" ? "⚠ Needs Attention" : "✗ Failed"}</span>}
                    </div>
                    {ev.note && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>{ev.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
