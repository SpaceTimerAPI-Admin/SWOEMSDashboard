import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addTicketComment,
  assignTicket,
  closeTicket,
  confirmTicketPhoto,
  getTicket,
  getTicketPhotoUploadUrl,
  getItemReviews,
  listEmployees,
  reopenTicket,
  updateTicketDue,
} from "../lib/api";
import { getProfile, getRole } from "../lib/auth";
import BarcodeInput from "../components/BarcodeInput";
import ScheduleReviewButton from "../components/ScheduleReviewButton";

type Ticket = any;

function pickData(res: any) {
  if (!res) return null;
  if (res.ok && "data" in res) return res.data;
  return res;
}

export default function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const ticketId = id || "";

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  const [comment, setComment] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [resolution, setResolution] = useState("");
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hardware replacement tracking on close
  type HwItem = {
    serial: string;
    lookupResult: any;   // null=not looked up, false=not found, object=found
    name: string;
    model: string;
    manufacturer: string;
    looking: boolean;
  };
  const emptyHw = (): HwItem => ({ serial: "", lookupResult: null, name: "", model: "", manufacturer: "", looking: false });
  const [hwInvolved, setHwInvolved]   = useState<"replaced" | "new_install" | "no_change" | null>(null);
  const [hwItems, setHwItems]         = useState<HwItem[]>([emptyHw()]); // new hardware installed
  const [removedItems, setRemovedItems] = useState<HwItem[]>([emptyHw()]); // old hardware taken out

  // Due date editing
  const [editingDue, setEditingDue] = useState(false);
  const [newDueDate, setNewDueDate] = useState("");
  const [dueSaving, setDueSaving] = useState(false);

  // Assignment
  const [employees, setEmployees] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);
  const profile = getProfile();

  useEffect(() => {
    listEmployees().then((res: any) => {
      if (res?.ok) setEmployees(res.data?.assignment_options || res.data?.employees || []);
    });
  }, []);

  async function handleAssign(assignedTo: string | null) {
    setAssigning(true);
    try {
      const res: any = await assignTicket(ticketId, assignedTo);
      if (!res?.ok) throw new Error(res?.error || "Failed to assign");
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to assign");
    } finally { setAssigning(false); }
  }

  async function handleReopen() {
    setBusy(true);
    try {
      const res: any = await reopenTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to reopen");
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to reopen");
    } finally { setBusy(false); }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await getTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to load ticket");
      const data: any = pickData(res);
      const t = data?.ticket || data;
      const merged = {
        ...(t || {}),
        comments: data?.comments ?? t?.comments ?? t?.history ?? [],
        photos: data?.photos ?? t?.photos ?? t?.photo_urls ?? [],
      };
      setTicket(merged);
    } catch (e: any) {
      setError(e?.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ticketId) {
      void load();
      getItemReviews(ticketId).then((res: any) => {
        const data = res?.ok ? (res.data?.reviews ?? res.reviews) : [];
        setReviews(data || []);
      });
    }
  }, [ticketId]);

  const photos = useMemo(() => {
    const arr = ticket?.photos || [];
    return Array.isArray(arr) ? arr : [];
  }, [ticket]);

  async function handleAddComment() {
    setCommentError(null);
    const c = comment.trim();
    if (!c) { setCommentError("Comment required."); return; }
    setBusy(true);
    try {
      const res: any = await addTicketComment({ ticket_id: ticketId, id: ticketId, comment: c });
      if (!res?.ok) throw new Error(res?.error || "Failed to add comment");
      setComment("");
      await load();
    } catch (e: any) {
      setCommentError(e?.message || "Failed to add comment");
    } finally { setBusy(false); }
  }

  function updateHwItem(idx: number, patch: Partial<HwItem>) {
    setHwItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function updateRemovedItem(idx: number, patch: Partial<HwItem>) {
    setRemovedItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  async function lookupHwSerial(idx: number) {
    const serial = hwItems[idx]?.serial.trim();
    if (!serial) return;
    updateHwItem(idx, { looking: true });
    try {
      const token = localStorage.getItem("md_session_token") || "";
      const res = await fetch(`/api/inventory-lookup?serial=${encodeURIComponent(serial)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      updateHwItem(idx, { looking: false, lookupResult: data.found ? data.item : false, name: data.found ? (data.item?.name || "") : "" });
    } catch { updateHwItem(idx, { looking: false, lookupResult: false }); }
  }

  async function lookupRemovedSerial(idx: number) {
    const serial = removedItems[idx]?.serial.trim();
    if (!serial) return;
    updateRemovedItem(idx, { looking: true });
    try {
      const token = localStorage.getItem("md_session_token") || "";
      const res = await fetch(`/api/inventory-lookup?serial=${encodeURIComponent(serial)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      updateRemovedItem(idx, { looking: false, lookupResult: data.found ? data.item : false, name: data.found ? (data.item?.name || "") : "" });
    } catch { updateRemovedItem(idx, { looking: false, lookupResult: false }); }
  }

  async function confirmClose() {
    const trimmed = resolution.trim();
    if (!trimmed) { setResolutionError("Please enter a resolution note."); return; }
    if (hwInvolved === null) { setResolutionError("Please answer whether hardware was changed."); return; }
    if (hwInvolved === "replaced" || hwInvolved === "new_install") {
      for (let i = 0; i < hwItems.length; i++) {
        const hw = hwItems[i];
        if (!hw.serial.trim()) { setResolutionError(`New item ${i + 1}: Serial number required.`); return; }
        if (hw.lookupResult === null) { setResolutionError(`New item ${i + 1}: Please look up the serial number first.`); return; }
        if (hw.lookupResult === false && !hw.name.trim()) { setResolutionError(`New item ${i + 1}: Name required for new item.`); return; }
      }
    }
    if (hwInvolved === "replaced") {
      for (let i = 0; i < removedItems.length; i++) {
        const hw = removedItems[i];
        if (!hw.serial.trim()) { setResolutionError(`Removed item ${i + 1}: Serial number required.`); return; }
        if (hw.lookupResult === null) { setResolutionError(`Removed item ${i + 1}: Please look up the serial number first.`); return; }
      }
    }
    setBusy(true); setResolutionError(null);
    try {
      let resolutionComment = `Resolution: ${trimmed}`;
      if (hwInvolved === "replaced") {
        resolutionComment += `\n\nHardware replaced:`;
        resolutionComment += `\n  Removed: ` + removedItems.map(hw => `${hw.serial.trim()}${hw.name ? ` — ${hw.name}` : ""}`).join(", ");
        resolutionComment += `\n  Installed: ` + hwItems.map(hw => `${hw.serial.trim()}${hw.name ? ` — ${hw.name}` : ""}`).join(", ");
      } else if (hwInvolved === "new_install") {
        resolutionComment += `\n\nNew hardware installed:\n` +
          hwItems.map((hw, i) => `  ${i + 1}. ${hw.serial.trim()}${hw.name ? ` — ${hw.name}` : ""}`).join("\n");
      }
      await addTicketComment({ id: ticketId, comment: resolutionComment });
      const res: any = await closeTicket(ticketId);
      if (!res?.ok) throw new Error(res?.error || "Failed to close work order");

      if (hwInvolved === "replaced" || hwInvolved === "new_install") {
        const token = localStorage.getItem("md_session_token") || "";
        // Log deployed event for new hardware
        for (const hw of hwItems) {
          if (!hw.serial.trim()) continue;
          await fetch("/api/inventory-event", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              item_id: hw.lookupResult && hw.lookupResult !== false ? hw.lookupResult.id : null,
              event_type: "deployed",
              location: ticket?.location || "",
              note: `${hwInvolved === "replaced" ? "Replacement install" : "New install"} via work order: ${ticket?.title || ticketId}`,
              linked_ticket_id: ticketId,
              create_if_missing: hw.lookupResult === false,
              new_item_serial: hw.serial.trim(),
              new_item_name: hw.name.trim(),
              new_item_model: hw.model.trim() || undefined,
              new_item_manufacturer: hw.manufacturer.trim() || undefined,
            }),
          });
        }
        // Log pulled event for removed hardware (replacements only)
        if (hwInvolved === "replaced") {
          for (const hw of removedItems) {
            if (!hw.serial.trim() || !hw.lookupResult || hw.lookupResult === false) continue;
            await fetch("/api/inventory-event", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                item_id: hw.lookupResult.id,
                event_type: "pulled",
                location: "Shop",
                note: `Replaced via work order: ${ticket?.title || ticketId}`,
                linked_ticket_id: ticketId,
              }),
            });
          }
        }
      }

      setShowCloseModal(false);
      setHwInvolved(null);
      setHwItems([emptyHw()]);
      setRemovedItems([emptyHw()]);
      await load();
    } catch (e: any) {
      setResolutionError(e?.message || String(e));
    } finally { setBusy(false); }
  }

  async function handleUpdateDue() {
    if (!newDueDate) return;
    setDueSaving(true);
    try {
      const res: any = await updateTicketDue(ticketId, newDueDate);
      if (!res?.ok) throw new Error(res?.error || "Failed to update due date");
      setEditingDue(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update due date");
    } finally { setDueSaving(false); }
  }

  async function uploadPhoto(file: File): Promise<void> {
    const safeName = (file?.name?.trim()) ? file.name : `photo_${Date.now()}.jpg`;
    const res: any = await getTicketPhotoUploadUrl({ ticket_id: ticketId, filename: safeName, file_name: safeName, content_type: file.type || "application/octet-stream" });
    if (!res?.ok) throw new Error(res?.error || "Failed to get upload URL");
    const data: any = pickData(res);
    const uploadUrl = data?.upload_url;
    const storageKey = data?.storage_key || data?.storage_path;
    if (!uploadUrl || !storageKey) throw new Error("Upload URL missing");
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!put.ok) throw new Error("Upload failed");
    const conf: any = await confirmTicketPhoto({ ticket_id: ticketId, storage_key: storageKey, storage_path: storageKey });
    if (!conf?.ok) throw new Error(conf?.error || "Confirm failed");
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    try { for (const f of files) await uploadPhoto(f); await load(); }
    catch (err: any) { alert(err?.message || "Photo upload failed"); }
    finally { setBusy(false); }
  }

  const history = useMemo(() => {
    const arr = ticket?.comments || ticket?.history || [];
    return Array.isArray(arr) ? arr : [];
  }, [ticket]);

  const isClosed = ticket?.status === "closed" || ticket?.status === "done";

  return (
    <div className="page fade-up">
      <span className="back-link" style={{cursor:"pointer"}} onClick={()=>nav(-1)}>
        
        Work Orders
      </span>

      {loading && <div className="muted">Loading…</div>}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

      {!loading && ticket && (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.025em", flex: 1 }}>{ticket.title}</h1>
            <span className={`chip ${isClosed ? "neutral" : "success"}`} style={{ marginTop: 4 }}>
              <span className={`status-dot ${isClosed ? "closed" : "open"}`} />
              {isClosed ? "Closed" : "Open"}
            </span>
          </div>

          <div className="muted" style={{ marginBottom: 6, fontSize: 13 }}>
            {ticket.location}
            {ticket.tag ? <><span className="dot">•</span><span>{ticket.tag}</span></> : null}
            {ticket.created_by_name ? <><span className="dot">•</span><span>by {ticket.created_by_name}</span></> : null}
          </div>

          {/* Review schedule indicator */}
          {reviews.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {reviews.map((r: any) => {
                const d = new Date(r.review_date + "T12:00:00");
                const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                const isOverdue = new Date(r.review_date + "T23:59:59") < new Date();
                return (
                  <div key={r.id} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                    background: isOverdue ? "rgba(255,182,39,0.12)" : "rgba(129,140,248,0.12)",
                    color: isOverdue ? "#FFD07A" : "#c7d2fe",
                    border: `1px solid ${isOverdue ? "rgba(255,182,39,0.3)" : "rgba(129,140,248,0.3)"}`,
                  }}>
                    📅 Review {isOverdue ? "overdue" : "scheduled"}: {label}
                    {r.note && <span style={{ fontWeight: 400, color: isOverdue ? "#FFD07A" : "#a5b4fc", fontSize: 11 }}>· {r.note}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Assigned person in header */}
          {(ticket.assigned_to || ticket.assigned_to_name || ticket.assigned_to_show_tech) && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 14,
              padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
              background: "rgba(92,107,255,0.12)", color: "#B0B8FF",
              border: "1px solid rgba(92,107,255,0.25)" }}>
              📌 {ticket.assigned_to_show_tech
                ? "Assigned to Show Tech"
                : ticket.assigned_to === profile?.id
                  ? "Assigned to you"
                  : `Assigned to ${ticket.assigned_to_name || employees.find((e: any) => e.id === ticket.assigned_to)?.name || "someone"}`}
            </div>
          )}

          {!isClosed && (
            <div className="btn-row" style={{ marginBottom: 16 }}>
              <button className="btn small danger" onClick={() => { setResolutionError(null); setResolution(""); setShowCloseModal(true); }} disabled={busy}>
                Close Work Order
              </button>
              <ScheduleReviewButton itemType="ticket" itemId={ticketId} itemTitle={ticket?.title || ""} />
            </div>
          )}

          {isClosed && (
            <div className="btn-row" style={{ marginBottom: 16 }}>
              <button className="btn small" onClick={handleReopen} disabled={busy}>
                {busy ? <span className="spinner" /> : "↩ Reopen"}
              </button>
            </div>
          )}

          {/* Editable Due Date */}
          {getRole() !== "show_tech" && (
            <div className="card" style={{ padding: "12px 15px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="detail-label">Due Date</div>
                  <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2 }}>
                    {ticket.sla_due_at
                      ? new Date(ticket.sla_due_at).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric" })
                      : <span className="muted">Not set</span>}
                    {ticket.sla_due_at && new Date(ticket.sla_due_at) < new Date() && !isClosed && (
                      <span style={{ marginLeft: 8, fontSize: 11, background: "rgba(255,84,84,0.15)", color: "#f87171", padding: "1px 7px", borderRadius: 99, fontWeight: 600 }}>OVERDUE</span>
                    )}
                  </div>
                </div>
                {!isClosed && !editingDue && (
                  <button className="btn small" onClick={() => {
                    const d = ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "";
                    setNewDueDate(d);
                    setEditingDue(true);
                  }}>
                    Edit
                  </button>
                )}
              </div>
              {editingDue && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="date" className="input" value={newDueDate}
                    onChange={e => setNewDueDate(e.target.value)}
                    style={{ flex: 1, minWidth: 150 }}
                  />
                  <button className="btn primary small" onClick={handleUpdateDue} disabled={dueSaving || !newDueDate}>
                    {dueSaving ? <span className="spinner" /> : "Save"}
                  </button>
                  <button className="btn small" onClick={() => setEditingDue(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* Assign */}
          <div className="card" style={{ padding: "12px 15px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="detail-label">Assigned To</div>
                <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2 }}>
                  {ticket.assigned_to_show_tech
                    ? "Show Tech"
                    : ticket.assigned_to
                      ? employees.find((e: any) => e.id === ticket.assigned_to)?.name || "Someone"
                      : <span className="muted">Unassigned</span>}
                  {ticket.assigned_to === profile?.id && (
                    <span style={{ marginLeft: 6, fontSize: 11, background: "rgba(92,107,255,0.15)", color: "#B0B8FF", padding: "1px 7px", borderRadius: 99, fontWeight: 600 }}>You</span>
                  )}
                </div>
              </div>
              {getRole() !== "show_tech" && (
                <select
                  className="input"
                  style={{ minWidth: 140, fontSize: 13, padding: "7px 10px" }}
                  value={ticket.assigned_to_show_tech ? "show_tech" : (ticket.assigned_to || "")}
                  disabled={assigning}
                  onChange={e => handleAssign(e.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {employees.map((emp: any) => (
                    emp.role === "show_tech"
                      ? <option key="show_tech" value="show_tech">── Show Tech ──</option>
                      : <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {ticket.details && (
            <div className="card" style={{ padding: "14px 15px", marginBottom: 10 }}>
              <div className="detail-label">Details</div>
              <div className="prewrap detail-value" style={{ marginTop: 4 }}>{ticket.details}</div>
            </div>
          )}

          <div className="card" style={{ padding: "14px 15px", marginBottom: 10 }}>
            <div className="detail-label" style={{ marginBottom: 8 }}>Add Update</div>
            <textarea
              className="textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note, update, or status change…"
              rows={3}
              style={{ minHeight: 70 }}
            />
            <div className="btn-row" style={{ marginTop: 10 }}>
              <label className="btn small" style={{ cursor: "pointer" }}>
                📎 Photos
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickFiles} />
              </label>
              <button className="btn primary small" disabled={busy} onClick={handleAddComment}>
                {busy ? <span className="spinner" /> : "Add comment"}
              </button>
            </div>
            {commentError && <div className="error" style={{ marginTop: 8 }}>{commentError}</div>}
          </div>

          {photos.length > 0 && (
            <div className="card" style={{ padding: "14px 15px", marginBottom: 10 }}>
              <div className="detail-label" style={{ marginBottom: 8 }}>Photos</div>
              <div className="photos-grid">
                {photos.map((p: any, idx: number) => {
                  const url = p?.public_url || p?.url || p;
                  if (!url) return null;
                  return (
                    <a key={idx} className="photo-item" href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: "14px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="detail-label" style={{ margin: 0 }}>History</div>
              <span className="count-pill">{history.length}</span>
            </div>
            {history.length === 0 && <div className="muted">No updates yet.</div>}
            {history.map((c: any, idx: number) => (
              <div key={idx} style={{
                padding: "10px 0",
                borderTop: idx === 0 ? "none" : "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.45 }}>{c.comment || c.text || c.message}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {(c.employee_name || c.employees?.name || "").toString()}
                  {c.created_at ? <><span className="dot">•</span>{new Date(c.created_at).toLocaleString()}</> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showCloseModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="card modal-card">
            <div className="modal-head">
              <h3 className="modal-title">Close Work Order</h3>
            </div>
            <div className="modal-body">
              <div className="field-label">Resolution note</div>
              <textarea
                className="textarea"
                value={resolution}
                onChange={(e) => { setResolution(e.target.value); setResolutionError(null); }}
                placeholder="What was done? Any follow-up needed?"
                style={{ minHeight: 80 }}
              />

              {/* Hardware question */}
              <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#c7d2fe", marginBottom: 10 }}>
                  📦 Did hardware get replaced or installed?
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: hwInvolved && hwInvolved !== "no_change" ? 14 : 0 }}>
                  {([
                    ["replaced",   "🔄 Replaced"],
                    ["new_install","✚ New Install"],
                    ["no_change",  "✗ No Change"],
                  ] as const).map(([v, label]) => (
                    <button key={v} type="button"
                      onClick={() => { setHwInvolved(v); setResolutionError(null); setHwItems([emptyHw()]); setRemovedItems([emptyHw()]); }}
                      style={{ flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                        background: hwInvolved === v ? (v === "no_change" ? "rgba(255,255,255,0.06)" : "rgba(129,140,248,0.2)") : "rgba(255,255,255,0.04)",
                        borderColor: hwInvolved === v ? (v === "no_change" ? "rgba(255,255,255,0.15)" : "rgba(129,140,248,0.4)") : "rgba(255,255,255,0.08)",
                        color: hwInvolved === v ? (v === "no_change" ? "#e5e7eb" : "#c7d2fe") : "#6b7280" }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* REPLACED — show both removed and new */}
                {hwInvolved === "replaced" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f87171", marginBottom: 8 }}>✖ Old Hardware (Being Removed)</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {removedItems.map((hw, idx) => (
                          <div key={idx} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(248,113,113,0.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Item {idx + 1}</div>
                              {removedItems.length > 1 && <button type="button" onClick={() => setRemovedItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}
                            </div>
                            <BarcodeInput value={hw.serial} onChange={val => updateRemovedItem(idx, { serial: val, lookupResult: null, name: "" })} placeholder="Scan or type old item serial…" onEnter={() => lookupRemovedSerial(idx)} />
                            {hw.serial.trim() && (
                              <button type="button" onClick={() => lookupRemovedSerial(idx)} disabled={hw.looking || !hw.serial.trim()} className="btn small" style={{ marginTop: 8, width: "100%" }}>
                                {hw.looking ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Look up"}
                              </button>
                            )}
                            {hw.lookupResult && hw.lookupResult !== false && <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#fca5a5", marginTop: 6 }}>✓ Found: <strong>{hw.lookupResult.name}</strong> — will be marked pulled from {hw.lookupResult.location}</div>}
                            {hw.lookupResult === false && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>⚠ Not in inventory — serial noted in resolution only</div>}
                          </div>
                        ))}
                        <button type="button" onClick={() => setRemovedItems(prev => [...prev, emptyHw()])} style={{ background: "rgba(248,113,113,0.06)", border: "1px dashed rgba(248,113,113,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px", width: "100%" }}>+ Add Another</button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6ee7b7", marginBottom: 8 }}>✚ New Hardware (Being Installed)</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {hwItems.map((hw, idx) => (
                          <div key={idx} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(52,211,153,0.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Item {idx + 1}</div>
                              {hwItems.length > 1 && <button type="button" onClick={() => setHwItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}
                            </div>
                            <BarcodeInput value={hw.serial} onChange={val => updateHwItem(idx, { serial: val, lookupResult: null, name: "" })} placeholder="Scan or type new item serial…" onEnter={() => lookupHwSerial(idx)} />
                            <button type="button" onClick={() => lookupHwSerial(idx)} disabled={hw.looking || !hw.serial.trim()} className="btn small" style={{ marginTop: 8, width: "100%" }}>
                              {hw.looking ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Look up"}
                            </button>
                            {hw.lookupResult && hw.lookupResult !== false && <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#6ee7b7", marginTop: 6 }}>✓ Found: <strong>{hw.lookupResult.name}</strong> — {hw.lookupResult.status?.replace("_", " ")} · {hw.lookupResult.location}</div>}
                            {hw.lookupResult === false && (
                              <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 7, padding: "9px 10px", marginTop: 6 }}>
                                <div style={{ fontSize: 11, color: "#fcd34d", marginBottom: 6 }}>⚠ Not in inventory — add it:</div>
                                <input className="input" value={hw.name} onChange={e => updateHwItem(idx, { name: e.target.value })} placeholder="Item name (required)" style={{ marginBottom: 6 }} />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input className="input" value={hw.manufacturer} onChange={e => updateHwItem(idx, { manufacturer: e.target.value })} placeholder="Manufacturer" style={{ flex: 1 }} />
                                  <input className="input" value={hw.model} onChange={e => updateHwItem(idx, { model: e.target.value })} placeholder="Model" style={{ flex: 1 }} />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => setHwItems(prev => [...prev, emptyHw()])} style={{ background: "rgba(52,211,153,0.06)", border: "1px dashed rgba(52,211,153,0.3)", borderRadius: 8, color: "#6ee7b7", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px", width: "100%" }}>+ Add Another</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* NEW INSTALL — only new hardware */}
                {hwInvolved === "new_install" && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6ee7b7", marginBottom: 8 }}>✚ New Hardware Being Installed</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {hwItems.map((hw, idx) => (
                        <div key={idx} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(52,211,153,0.15)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Item {idx + 1}</div>
                            {hwItems.length > 1 && <button type="button" onClick={() => setHwItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}
                          </div>
                          <BarcodeInput value={hw.serial} onChange={val => updateHwItem(idx, { serial: val, lookupResult: null, name: "" })} placeholder="Scan or type serial…" onEnter={() => lookupHwSerial(idx)} />
                          <button type="button" onClick={() => lookupHwSerial(idx)} disabled={hw.looking || !hw.serial.trim()} className="btn small" style={{ marginTop: 8, width: "100%" }}>
                            {hw.looking ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Look up"}
                          </button>
                          {hw.lookupResult && hw.lookupResult !== false && <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#6ee7b7", marginTop: 6 }}>✓ Found: <strong>{hw.lookupResult.name}</strong> — {hw.lookupResult.status?.replace("_", " ")} · {hw.lookupResult.location}</div>}
                          {hw.lookupResult === false && (
                            <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 7, padding: "9px 10px", marginTop: 6 }}>
                              <div style={{ fontSize: 11, color: "#fcd34d", marginBottom: 6 }}>⚠ Not in inventory — add it:</div>
                              <input className="input" value={hw.name} onChange={e => updateHwItem(idx, { name: e.target.value })} placeholder="Item name (required)" style={{ marginBottom: 6 }} />
                              <div style={{ display: "flex", gap: 6 }}>
                                <input className="input" value={hw.manufacturer} onChange={e => updateHwItem(idx, { manufacturer: e.target.value })} placeholder="Manufacturer" style={{ flex: 1 }} />
                                <input className="input" value={hw.model} onChange={e => updateHwItem(idx, { model: e.target.value })} placeholder="Model" style={{ flex: 1 }} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setHwItems(prev => [...prev, emptyHw()])} style={{ background: "rgba(52,211,153,0.06)", border: "1px dashed rgba(52,211,153,0.3)", borderRadius: 8, color: "#6ee7b7", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px", width: "100%" }}>+ Add Another</button>
                    </div>
                  </div>
                )}
              </div>
                <div style={{ display: "flex", gap: 8, marginBottom: hwInvolved === "yes" ? 12 : 0 }}>
                  {([["yes", "✓ Yes"], ["no", "✗ No"]] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => { setHwInvolved(v); setResolutionError(null); if (v === "yes") { setHwItems([emptyHw()]); setRemovedItems([emptyHw()]); } }}
                      style={{ flex: 1, padding: "7px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                        background: hwInvolved === v ? (v === "yes" ? "rgba(129,140,248,0.2)" : "rgba(255,255,255,0.06)") : "rgba(255,255,255,0.04)",
                        borderColor: hwInvolved === v ? (v === "yes" ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.08)",
                        color: hwInvolved === v ? (v === "yes" ? "#c7d2fe" : "#e5e7eb") : "#6b7280" }}>
                      {label}
                    </button>
                  ))}
                </div>

                {hwInvolved === "yes" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    {/* NEW hardware installed */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6ee7b7", marginBottom: 8 }}>
                        ✚ New Hardware Installed
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {hwItems.map((hw, idx) => (
                          <div key={idx} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(52,211,153,0.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280" }}>Item {idx + 1}</div>
                              {hwItems.length > 1 && <button type="button" onClick={() => setHwItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}
                            </div>
                            <BarcodeInput value={hw.serial} onChange={val => updateHwItem(idx, { serial: val, lookupResult: null, name: "" })} placeholder="Scan or type new item serial…" onEnter={() => lookupHwSerial(idx)} />
                            <div style={{ marginTop: 8 }}>
                              <button type="button" onClick={() => lookupHwSerial(idx)} disabled={hw.looking || !hw.serial.trim()} className="btn small" style={{ width: "100%" }}>
                                {hw.looking ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Look up"}
                              </button>
                            </div>
                            {hw.lookupResult && hw.lookupResult !== false && (
                              <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#6ee7b7", marginTop: 6 }}>
                                ✓ Found: <strong>{hw.lookupResult.name}</strong> — {hw.lookupResult.status?.replace("_", " ")} · {hw.lookupResult.location}
                              </div>
                            )}
                            {hw.lookupResult === false && (
                              <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 7, padding: "9px 10px", marginTop: 6 }}>
                                <div style={{ fontSize: 11, color: "#fcd34d", marginBottom: 6 }}>⚠ Not in inventory — add it:</div>
                                <input className="input" value={hw.name} onChange={e => updateHwItem(idx, { name: e.target.value })} placeholder="Item name (required)" style={{ marginBottom: 6 }} />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input className="input" value={hw.manufacturer} onChange={e => updateHwItem(idx, { manufacturer: e.target.value })} placeholder="Manufacturer" style={{ flex: 1 }} />
                                  <input className="input" value={hw.model} onChange={e => updateHwItem(idx, { model: e.target.value })} placeholder="Model" style={{ flex: 1 }} />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => setHwItems(prev => [...prev, emptyHw()])}
                          style={{ background: "rgba(52,211,153,0.06)", border: "1px dashed rgba(52,211,153,0.3)", borderRadius: 8, color: "#6ee7b7", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px", width: "100%" }}>
                          + Add Another New Item
                        </button>
                      </div>
                    </div>

                    {/* REMOVED hardware */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f87171", marginBottom: 8 }}>
                        ✖ Hardware Removed / Taken Out
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {removedItems.map((hw, idx) => (
                          <div key={idx} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(248,113,113,0.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280" }}>Item {idx + 1}</div>
                              {removedItems.length > 1 && <button type="button" onClick={() => setRemovedItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}
                            </div>
                            <BarcodeInput value={hw.serial} onChange={val => updateRemovedItem(idx, { serial: val, lookupResult: null, name: "" })} placeholder="Scan or type removed item serial…" onEnter={() => lookupRemovedSerial(idx)} />
                            {hw.serial.trim() && (
                              <div style={{ marginTop: 8 }}>
                                <button type="button" onClick={() => lookupRemovedSerial(idx)} disabled={hw.looking || !hw.serial.trim()} className="btn small" style={{ width: "100%" }}>
                                  {hw.looking ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Look up"}
                                </button>
                              </div>
                            )}
                            {hw.lookupResult && hw.lookupResult !== false && (
                              <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#fca5a5", marginTop: 6 }}>
                                ✓ Found: <strong>{hw.lookupResult.name}</strong> — will be marked as pulled from {hw.lookupResult.location}
                              </div>
                            )}
                            {hw.lookupResult === false && (
                              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>⚠ Serial not in inventory — removal noted in resolution only</div>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => setRemovedItems(prev => [...prev, emptyHw()])}
                          style={{ background: "rgba(248,113,113,0.06)", border: "1px dashed rgba(248,113,113,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px", width: "100%" }}>
                          + Add Another Removed Item
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              {resolutionError && <div className="error" style={{ marginTop: 8 }}>{resolutionError}</div>}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn small" type="button" onClick={() => { setShowCloseModal(false); setHwInvolved(null); setHwItems([emptyHw()]); setRemovedItems([emptyHw()]); setResolutionError(null); setResolution(""); }} disabled={busy}>Cancel</button>
                <button className="btn primary small" type="button" onClick={confirmClose} disabled={busy}>
                  {busy ? <span className="spinner" /> : "Confirm close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
