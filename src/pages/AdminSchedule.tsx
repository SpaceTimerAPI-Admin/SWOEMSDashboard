import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getWeekSchedule, scheduleUpdateEntry, uploadSchedule } from "../lib/api";

const TZ = "America/New_York";

function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function sundayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("en-CA");
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function fmtDayHeader(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
  };
}

function fmtWeekRange(weekStart: string) {
  const end = addDays(weekStart, 6);
  const s = new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}

type Entry = { employee_name: string; work_date: string; shift_start: string | null; shift_end: string | null; all_shifts: string | null };
type EditState = { employee_name: string; shift_start: string; shift_end: string };

export default function AdminSchedule() {
  const today = todayET();
  const [weekStart, setWeekStart] = useState(sundayOfWeek(today));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  // Edit modal state
  const [editModal, setEditModal] = useState<{ entry: Entry; date: string } | null>(null);
  const [editForm, setEditForm] = useState<EditState>({ employee_name: "", shift_start: "", shift_end: "" });

  // Add person modal
  const [addModal, setAddModal] = useState<{ date: string } | null>(null);
  const [addForm, setAddForm] = useState({ employee_name: "", shift_start: "", shift_end: "" });

  // Bulk add modal
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkTab, setBulkTab] = useState<"manual" | "ai">("manual");
  const [bulkText, setBulkText] = useState("");
  const [aiUploading, setAiUploading] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  async function load(ws = weekStart) {
    setLoading(true);
    try {
      const res: any = await getWeekSchedule(ws);
      if (res?.ok) setEntries((res.data ?? res).entries || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void load(weekStart); }, [weekStart]);

  // Group entries by date
  const byDate = new Map<string, Entry[]>();
  for (const d of days) byDate.set(d, []);
  for (const e of entries) {
    const list = byDate.get(e.work_date);
    if (list) list.push(e);
  }

  // All unique names for the week
  const allNames = [...new Set(entries.map(e => e.employee_name))].sort();

  async function saveEntry(action: "upsert" | "delete", payload: any) {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res: any = await scheduleUpdateEntry({ action, ...payload });
      if (!res?.ok) throw new Error(res?.error || "Failed");
      setStatusMsg({ ok: true, msg: action === "delete" ? "Removed" : "Saved" });
      await load(weekStart);
    } catch (e: any) {
      setStatusMsg({ ok: false, msg: e?.message || "Failed" });
    } finally { setSaving(false); }
  }

  function openEdit(entry: Entry) {
    setEditModal({ entry, date: entry.work_date });
    setEditForm({
      employee_name: entry.employee_name,
      shift_start: entry.shift_start || "",
      shift_end: entry.shift_end || "",
    });
    setStatusMsg(null);
  }

  async function handleEditSave() {
    if (!editModal) return;
    await saveEntry("upsert", {
      work_date: editModal.date,
      employee_name: editForm.employee_name,
      shift_start: editForm.shift_start || null,
      shift_end: editForm.shift_end || null,
    });
    setEditModal(null);
  }

  async function handleDelete() {
    if (!editModal) return;
    await saveEntry("delete", {
      work_date: editModal.date,
      employee_name: editModal.entry.employee_name,
    });
    setEditModal(null);
  }

  async function handleAddSave() {
    if (!addModal || !addForm.employee_name.trim()) return;
    await saveEntry("upsert", {
      work_date: addModal.date,
      employee_name: addForm.employee_name.trim(),
      shift_start: addForm.shift_start || null,
      shift_end: addForm.shift_end || null,
    });
    setAddModal(null);
    setAddForm({ employee_name: "", shift_start: "", shift_end: "" });
  }

  async function handleAiUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAiStatus(null);
    setAiUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const result: any = await uploadSchedule({
        image_base64: base64,
        content_type: file.type || "image/jpeg",
      });
      if (!result?.ok) throw new Error(result?.error || "Failed to read schedule");
      const data = result.data ?? result;
      const dates: string[] = data.dates || [];
      const friendly = dates.map((d: string) =>
        new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      );
      setAiStatus({ ok: true, msg: `✓ Imported ${data.count} shifts across ${dates.length} day${dates.length !== 1 ? "s" : ""}: ${friendly.join(", ")}` });
      await load(weekStart);
    } catch (err: any) {
      setAiStatus({ ok: false, msg: err?.message || "Upload failed" });
    } finally {
      setAiUploading(false);
    }
  }

  // Bulk manual save
  async function handleBulkSave() {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    let saved = 0, failed = 0;
    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length < 3) { failed++; continue; }
      const [name, timeRange, date] = parts;
      if (!name || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { failed++; continue; }
      const times = timeRange.match(/(\d+:\d+\s*[AP]M)\s*[-–]\s*(\d+:\d+\s*[AP]M)/i);
      try {
        await scheduleUpdateEntry({
          action: "upsert",
          work_date: date,
          employee_name: name,
          shift_start: times ? times[1] : undefined,
          shift_end: times ? times[2] : undefined,
        });
        saved++;
      } catch { failed++; }
    }
    setStatusMsg({ ok: failed === 0, msg: `Saved ${saved} entr${saved !== 1 ? "ies" : "y"}${failed > 0 ? `, ${failed} failed` : ""}` });
    setBulkModal(false);
    setBulkText("");
    await load(weekStart);
  }

  return (
    <div className="page fade-up" style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Link to="/admin" style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}>← Admin</Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="page-title">Schedule Editor</div>
          <div className="page-subtitle">{fmtWeekRange(weekStart)}</div>
        </div>
        <button
          onClick={() => { setBulkModal(true); setBulkText(""); setBulkTab("manual"); setAiStatus(null); }}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.05)", color: "var(--muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Bulk Add
        </button>
      </div>

      {statusMsg && (
        <div style={{ marginBottom: 12, padding: "10px 13px", borderRadius: 10, fontSize: 13,
          background: statusMsg.ok ? "var(--success-bg)" : "var(--danger-bg)",
          color: statusMsg.ok ? "#7EEFC4" : "#FFB0B0",
          border: `1px solid ${statusMsg.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}` }}>
          {statusMsg.msg}
        </div>
      )}

      {/* Week navigation */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>‹</button>
        <button onClick={() => setWeekStart(sundayOfWeek(today))} style={{
          flex: 1, padding: "6px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Today's Week</button>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>›</button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: "24px", textAlign: "center" }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {days.map(date => {
            const { weekday, date: dateLabel } = fmtDayHeader(date);
            const dayEntries = (byDate.get(date) || []).sort((a, b) => (a.shift_start || "").localeCompare(b.shift_start || ""));
            const isToday = date === today;
            return (
              <div key={date}>
                {/* Day header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: isToday ? "#B0B8FF" : "var(--text)" }}>
                    {weekday} <span style={{ color: "var(--muted2)" }}>{dateLabel}</span>
                    {isToday && <span style={{ marginLeft: 8, fontSize: 10, background: "rgba(92,107,255,0.2)", color: "#B0B8FF", padding: "1px 7px", borderRadius: 99, fontWeight: 700 }}>TODAY</span>}
                  </div>
                  <button
                    onClick={() => { setAddModal({ date }); setAddForm({ employee_name: "", shift_start: "", shift_end: "" }); }}
                    style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(92,107,255,0.3)",
                      background: "rgba(92,107,255,0.1)", color: "#B0B8FF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    + Add
                  </button>
                </div>

                {dayEntries.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted2)", padding: "8px 0", fontStyle: "italic" }}>No shifts — tap + Add to add one</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {dayEntries.map((entry, i) => (
                      <div key={i} className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{entry.employee_name}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            {entry.all_shifts || (entry.shift_start && entry.shift_end ? `${entry.shift_start} – ${entry.shift_end}` : "No time set")}
                          </div>
                        </div>
                        <button
                          onClick={() => openEdit(entry)}
                          style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)",
                            background: "rgba(255,255,255,0.05)", color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* EDIT MODAL */}
      {editModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }}>
          <div className="card modal-card" style={{ maxWidth: 380 }}>
            <div className="modal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="modal-title">Edit Shift</h3>
              <button onClick={() => setEditModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body">
              <label><div className="field-label">Name</div>
                <input className="input" value={editForm.employee_name} onChange={e => setEditForm(f => ({ ...f, employee_name: e.target.value }))} /></label>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 100px" }}><div className="field-label">Start</div>
                  <input className="input" value={editForm.shift_start} onChange={e => setEditForm(f => ({ ...f, shift_start: e.target.value }))} placeholder="6:00 AM" /></label>
                <label style={{ flex: "1 1 100px" }}><div className="field-label">End</div>
                  <input className="input" value={editForm.shift_end} onChange={e => setEditForm(f => ({ ...f, shift_end: e.target.value }))} placeholder="2:30 PM" /></label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "space-between", flexWrap: "wrap" }}>
                <button onClick={handleDelete} disabled={saving}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,84,84,0.3)", background: "rgba(255,84,84,0.1)", color: "#FFB0B0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Remove
                </button>
                <button className="btn primary" onClick={handleEditSave} disabled={saving}>
                  {saving ? <span className="spinner" /> : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD MODAL */}
      {addModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAddModal(null); }}>
          <div className="card modal-card" style={{ maxWidth: 380 }}>
            <div className="modal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="modal-title">Add Shift — {fmtDayHeader(addModal.date).weekday} {fmtDayHeader(addModal.date).date}</h3>
              <button onClick={() => setAddModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body">
              <label><div className="field-label">Name (e.g. "Andy O.")</div>
                <input className="input" value={addForm.employee_name}
                  onChange={e => setAddForm(f => ({ ...f, employee_name: e.target.value }))}
                  placeholder="Andy O."
                  list="known-names" />
                <datalist id="known-names">
                  {allNames.map(n => <option key={n} value={n} />)}
                </datalist>
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 100px" }}><div className="field-label">Start</div>
                  <input className="input" value={addForm.shift_start} onChange={e => setAddForm(f => ({ ...f, shift_start: e.target.value }))} placeholder="6:00 AM" /></label>
                <label style={{ flex: "1 1 100px" }}><div className="field-label">End</div>
                  <input className="input" value={addForm.shift_end} onChange={e => setAddForm(f => ({ ...f, shift_end: e.target.value }))} placeholder="2:30 PM" /></label>
              </div>
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn small" onClick={() => setAddModal(null)}>Cancel</button>
                <button className="btn primary small" onClick={handleAddSave} disabled={saving || !addForm.employee_name.trim()}>
                  {saving ? <span className="spinner" /> : "Add Shift"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK ADD MODAL */}
      {bulkModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBulkModal(false); }}>
          <div className="card modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="modal-title">Bulk Add Shifts</h3>
              <button onClick={() => setBulkModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body">

              {/* Tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 4 }}>
                {(["manual", "ai"] as const).map(tab => (
                  <button key={tab} onClick={() => { setBulkTab(tab); setAiStatus(null); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      background: bulkTab === tab ? "rgba(92,107,255,0.2)" : "transparent",
                      color: bulkTab === tab ? "#B0B8FF" : "var(--muted)" }}>
                    {tab === "manual" ? "✏️ Manual Entry" : "🤖 AI Upload"}
                  </button>
                ))}
              </div>

              {bulkTab === "manual" ? (
                <>
                  <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 10, lineHeight: 1.6 }}>
                    One entry per line:<br />
                    <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>Name, Start - End, YYYY-MM-DD</code><br />
                    Example: <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>Andy O., 6:00 AM - 2:30 PM, 2026-05-19</code>
                  </div>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 160, fontFamily: "monospace", fontSize: 12 }}
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder={"Andy O., 6:00 AM - 2:30 PM, 2026-05-19\nAdam C., 1:30 PM - 10:00 PM, 2026-05-19"}
                  />
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button className="btn small" onClick={() => setBulkModal(false)}>Cancel</button>
                    <button className="btn primary small" onClick={handleBulkSave} disabled={saving || !bulkText.trim()}>
                      {saving ? <span className="spinner" /> : "Save All"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleAiUpload} />
                  <div style={{ textAlign: "center", padding: "24px 16px" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📸</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Upload Schedule Photo or PDF</div>
                    <div style={{ fontSize: 13, color: "var(--muted2)", marginBottom: 20, lineHeight: 1.5 }}>
                      AI will automatically read the names, dates, and shift times from the image and add them to the schedule.
                    </div>
                    <button
                      className="btn primary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={aiUploading}
                      style={{ marginBottom: aiStatus ? 14 : 0 }}
                    >
                      {aiUploading ? <><span className="spinner" /> Reading schedule…</> : "Choose Photo or PDF"}
                    </button>
                    {aiStatus && (
                      <div style={{
                        marginTop: 14, padding: "10px 13px", borderRadius: 10, fontSize: 13, lineHeight: 1.5, textAlign: "left",
                        background: aiStatus.ok ? "var(--success-bg)" : "var(--danger-bg)",
                        color: aiStatus.ok ? "#7EEFC4" : "#FFB0B0",
                        border: `1px solid ${aiStatus.ok ? "rgba(46,232,160,0.22)" : "rgba(255,84,84,0.25)"}`,
                      }}>
                        {aiStatus.msg}
                      </div>
                    )}
                  </div>
                  <div className="btn-row" style={{ marginTop: 4 }}>
                    <button className="btn small" onClick={() => setBulkModal(false)}>
                      {aiStatus?.ok ? "Done" : "Cancel"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
