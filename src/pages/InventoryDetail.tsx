import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getProfile } from "../lib/auth";

const TZ = "America/New_York";
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
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

const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
  received:              { label: "Received",             icon: "📦", color: "#6ee7b7" },
  checked_out:           { label: "Checked Out",          icon: "👤", color: "#fcd34d" },
  checked_in:            { label: "Checked In",           icon: "↩️", color: "#6ee7b7" },
  deployed:              { label: "Deployed",             icon: "🔧", color: "#818cf8" },
  pulled:                { label: "Pulled from Service",  icon: "⬆️", color: "#9ca3af" },
  sent_to_repair:        { label: "Sent to Repair",       icon: "🔨", color: "#f87171" },
  returned_from_repair:  { label: "Returned from Repair", icon: "✅", color: "#6ee7b7" },
  retired:               { label: "Retired",              icon: "🗃️", color: "#6b7280" },
  note:                  { label: "Note",                 icon: "📝", color: "#9ca3af" },
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  open: "#fcd34d", in_progress: "#818cf8", closed: "#6ee7b7", cancelled: "#6b7280",
};

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

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return res.json();
}

export default function InventoryDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const profile = getProfile();

  const [item, setItem]     = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "audit" | "tickets">("overview");

  // Action form
  const [showAction, setShowAction]     = useState(false);
  const [actionType, setActionType]     = useState("");
  const [location, setLocation]         = useState("");
  const [takenBy, setTakenBy]           = useState(profile?.name || "");
  const [vendor, setVendor]             = useState("");
  const [condition, setCondition]       = useState("");
  const [note, setNote]                 = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);

  useEffect(() => { if (id) void load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inventory-get?id=${id}`);
      if (res.ok) { setItem(res.item); setEvents(res.events || []); setStats(res.stats || null); }
    } finally { setLoading(false); }
  }

  function openAction(type: string) {
    setActionType(type); setLocation(""); setVendor(""); setCondition(""); setNote(""); setActionError(null);
    setTakenBy(profile?.name || ""); setShowAction(true);
  }

  async function submitAction(e: React.FormEvent) {
    e.preventDefault(); setActionError(null);
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
      setItem(res.item); await load(); setShowAction(false);
    } catch (err: any) { setActionError(err?.message || "Failed"); } finally { setActionSaving(false); }
  }

  if (loading) return <div className="page fade-up" style={{ textAlign: "center", paddingTop: 60 }}><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>;
  if (!item) return <div className="page fade-up"><div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Item not found.</div></div>;

  const sm = STATUS_META[item.status] || { label: item.status, color: "#9ca3af", bg: "rgba(156,163,175,0.15)" };
  const availableActions = EVENT_ACTIONS.filter(a => !a.statusFilter || a.statusFilter.includes(item.status));
  const selectedAction = EVENT_ACTIONS.find(a => a.event_type === actionType);

  // Linked tickets (deduplicated)
  const linkedTickets: any[] = [];
  const seenIds = new Set<string>();
  for (const ev of events) {
    if (ev.linked_ticket && !seenIds.has(ev.linked_ticket.id)) {
      seenIds.add(ev.linked_ticket.id);
      linkedTickets.push(ev.linked_ticket);
    }
  }

  return (
    <div className="page fade-up">
      <span className="back-link" style={{ cursor: "pointer" }} onClick={() => nav(-1)}>← Inventory</span>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div>
          <div className="page-title">{item.name}</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted2)", marginTop: 2 }}>{item.asset_tag}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 99, flexShrink: 0, alignSelf: "flex-start", color: sm.color, background: sm.bg, border: `1px solid ${sm.color}44` }}>
          {sm.label}
        </span>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "Events", value: stats.totalEvents },
            { label: "Times Repaired", value: stats.timesInRepair },
            { label: "Times Deployed", value: stats.timesDeployed },
            { label: "Work Orders", value: stats.linkedTicketCount },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", textAlign: "center", flex: "1 1 auto" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {([["overview","Overview"], ["audit","Audit Trail"], ["tickets","Work Orders"]] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
              background: activeTab === tab ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.04)",
              borderColor: activeTab === tab ? "rgba(129,140,248,0.35)" : "rgba(255,255,255,0.08)",
              color: activeTab === tab ? "#c7d2fe" : "var(--muted)" }}>
            {label}
            {tab === "tickets" && linkedTickets.length > 0 && (
              <span style={{ marginLeft: 5, background: "rgba(129,140,248,0.3)", borderRadius: 99, fontSize: 10, padding: "1px 5px" }}>{linkedTickets.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
              {[
                { label: "Category",     value: item.category_name },
                { label: "Manufacturer", value: item.manufacturer },
                { label: "Model",        value: item.model },
                { label: "Serial #",     value: item.serial_number },
                { label: "Location",     value: item.location },
                { label: "Added",        value: item.created_at ? fmtDateShort(item.created_at) : null },
              ].filter(f => f.value).map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted2)" }}>{f.label}</div>
                  <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2, fontFamily: f.label === "Serial #" ? "monospace" : undefined }}>{f.value}</div>
                </div>
              ))}
            </div>
            {item.status === "checked_out" && (
              <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                <div style={{ fontSize: 12, color: "#fcd34d", fontWeight: 600 }}>👤 Checked out to {item.checked_out_to_name}</div>
                {item.checked_out_at && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 2 }}>{fmtDate(item.checked_out_at)} · {daysSince(item.checked_out_at)} days ago</div>}
              </div>
            )}
            {item.status === "deployed" && (
              <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)" }}>
                <div style={{ fontSize: 12, color: "#c7d2fe", fontWeight: 600 }}>🔧 Deployed to {item.deployed_to}</div>
                {item.deployed_by_name && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 2 }}>By {item.deployed_by_name} · {item.deployed_at ? fmtDate(item.deployed_at) : ""}{item.deployed_at ? ` · ${daysSince(item.deployed_at)} days in field` : ""}</div>}
              </div>
            )}
            {item.notes && <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 10, lineHeight: 1.5 }}>{item.notes}</div>}
          </div>

          {/* Quick action buttons */}
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
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>{selectedAction?.icon} {selectedAction?.label}</div>
              <form onSubmit={submitAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedAction?.needsTakenBy && (
                  <label><div className="field-label">Person Checking Out <span style={{ color: "var(--danger)" }}>*</span></div>
                    <input className="input" value={takenBy} onChange={e => setTakenBy(e.target.value)} placeholder="Who is taking this?" /></label>
                )}
                <label>
                  <div className="field-label">{selectedAction?.locationLabel || "Location"}{selectedAction?.locationRequired && <span style={{ color: "var(--danger)" }}> *</span>}</div>
                  <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder={selectedAction?.locationPlaceholder || "Location…"} />
                </label>
                {selectedAction?.needsVendor && (
                  <label><div className="field-label">Vendor / Who's Doing the Repair</div>
                    <input className="input" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Internal shop, B&H Service" /></label>
                )}
                {selectedAction?.needsCondition && (
                  <div><div className="field-label">Condition</div>
                    <div className="tag-row">{[["good","✓ Good"],["needs_attention","⚠ Needs Attention"],["failed","✗ Failed"]].map(([v,l]) => (
                      <button key={v} type="button" className={`tag-btn${condition===v?" active":""}`} onClick={() => setCondition(v)}>{l}</button>
                    ))}</div>
                  </div>
                )}
                <label><div className="field-label">Note</div>
                  <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional details…" style={{ minHeight: 50 }} /></label>
                {actionError && <div style={{ fontSize: 12, color: "#FFB0B0" }}>⚠ {actionError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" disabled={actionSaving} className="btn primary small">{actionSaving ? <span className="spinner" /> : "Confirm"}</button>
                  <button type="button" className="btn small" onClick={() => setShowAction(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* ── AUDIT TRAIL TAB ── */}
      {activeTab === "audit" && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 14 }}>
            Full Audit Trail — {events.length} event{events.length !== 1 ? "s" : ""}
          </div>
          {events.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No events recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {events.map((ev: any, i: number) => {
                const em = EVENT_META[ev.event_type] || { label: ev.event_type, icon: "•", color: "#9ca3af" };
                return (
                  <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: i < events.length - 1 ? 14 : 0, marginBottom: i < events.length - 1 ? 14 : 0, borderBottom: i < events.length - 1 ? "1px solid var(--border)" : "none" }}>
                    {/* Timeline dot */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${em.color}22`, border: `1px solid ${em.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{em.icon}</div>
                      {i < events.length - 1 && <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.06)", marginTop: 4 }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: em.color }}>{em.label}</span>
                        <span style={{ fontSize: 10, color: "var(--muted2)", flexShrink: 0 }}>{fmtDate(ev.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                        {ev.performed_by_name && <div>👤 <strong>{ev.performed_by_name}</strong></div>}
                        {ev.taken_by && ev.taken_by !== ev.performed_by_name && <div>→ Handed to <strong>{ev.taken_by}</strong></div>}
                        {ev.location && <div>📍 {ev.location}</div>}
                        {ev.vendor && <div>🔨 {ev.vendor}</div>}
                        {ev.condition && <div>{ev.condition === "good" ? "✓ Good condition" : ev.condition === "needs_attention" ? "⚠ Needs attention" : "✗ Failed"}</div>}
                      </div>
                      {ev.note && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, padding: "5px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 6, borderLeft: "2px solid rgba(255,255,255,0.1)", fontStyle: "italic" }}>{ev.note}</div>}
                      {ev.linked_ticket && (
                        <Link to={`/tickets/${ev.linked_ticket.id}`} style={{ textDecoration: "none" }}>
                          <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, background: "rgba(92,107,255,0.08)", border: "1px solid rgba(92,107,255,0.2)", cursor: "pointer" }}>
                            <span style={{ fontSize: 11 }}>🔧</span>
                            <span style={{ fontSize: 11, color: "#c7d2fe", fontWeight: 600 }}>{ev.linked_ticket.title}</span>
                            <span style={{ fontSize: 10, color: "var(--muted2)" }}>· {ev.linked_ticket.location}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: `${TICKET_STATUS_COLORS[ev.linked_ticket.status] || "#6b7280"}22`, color: TICKET_STATUS_COLORS[ev.linked_ticket.status] || "#6b7280" }}>
                              {ev.linked_ticket.status}
                            </span>
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── WORK ORDERS TAB ── */}
      {activeTab === "tickets" && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 14 }}>
            Linked Work Orders — {linkedTickets.length}
          </div>
          {linkedTickets.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No work orders linked to this item yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {linkedTickets.map((t: any) => {
                const statusColor = TICKET_STATUS_COLORS[t.status] || "#6b7280";
                // Find which events reference this ticket
                const relatedEvents = events.filter(e => e.linked_ticket_id === t.id);
                return (
                  <Link key={t.id} to={`/tickets/${t.id}`} style={{ textDecoration: "none" }}>
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{t.title}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, flexShrink: 0, background: `${statusColor}22`, color: statusColor }}>
                          {t.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                        {t.location && <span>📍 {t.location}</span>}
                        {t.category && <span style={{ marginLeft: 8 }}>· {t.category}</span>}
                        {t.created_at && <span style={{ marginLeft: 8 }}>· {fmtDateShort(t.created_at)}</span>}
                      </div>
                      {relatedEvents.length > 0 && (
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {relatedEvents.map(ev => {
                            const em = EVENT_META[ev.event_type] || { label: ev.event_type, icon: "•", color: "#9ca3af" };
                            return (
                              <span key={ev.id} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: `${em.color}18`, color: em.color, border: `1px solid ${em.color}33` }}>
                                {em.icon} {em.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
