import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getProcedure, saveProcedure, uploadProcedurePhoto } from "../lib/api";

const CATEGORIES = ["A Side", "B Side"] as const;
const VISIBILITY = [
  { value: "everyone", label: "Everyone", desc: "All roles including Show Tech" },
  { value: "ems",      label: "EMS + Admin", desc: "Not visible to Show Tech" },
  { value: "admin",    label: "Admin Only", desc: "Only admins can view" },
] as const;

type Step = { id?: string; title: string; notes: string; photo_url: string; photo_path: string; uploading?: boolean };

function emptyStep(): Step {
  return { title: "", notes: "", photo_url: "", photo_path: "" };
}

export default function ProcedureBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const nav = useNavigate();

  const [title, setTitle]         = useState("");
  const [category, setCategory]   = useState<string>("A Side");
  const [visibility, setVis]      = useState<string>("ems");
  const [steps, setSteps]         = useState<Step[]>([emptyStep()]);
  const [current, setCurrent]     = useState(0);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(isEdit);
  const [showMeta, setShowMeta]   = useState(!isEdit); // show meta form first for new
  const photoRef = useRef<HTMLInputElement>(null);

  // Load existing procedure for edit
  useEffect(() => {
    if (!isEdit) return;
    async function load() {
      try {
        const res: any = await getProcedure(id!);
        if (!res?.ok) throw new Error(res?.error || "Not found");
        const data = res.data ?? res;
        setTitle(data.procedure.title);
        setCategory(data.procedure.category);
        setVis(data.procedure.visibility);
        setSteps(data.steps.length > 0
          ? data.steps.map((s: any) => ({ id: s.id, title: s.title, notes: s.notes || "", photo_url: s.photo_url || "", photo_path: s.photo_path || "" }))
          : [emptyStep()]
        );
        setShowMeta(false);
      } catch (e: any) {
        setError(e?.message || "Failed to load");
      }
      setLoading(false);
    }
    void load();
  }, [id, isEdit]);

  function updateStep(field: keyof Step, value: string) {
    setSteps(prev => prev.map((s, i) => i === current ? { ...s, [field]: value } : s));
  }

  function addStep() {
    const next = [...steps, emptyStep()];
    setSteps(next);
    setCurrent(next.length - 1);
  }

  function removeStep(idx: number) {
    if (steps.length === 1) return;
    const next = steps.filter((_, i) => i !== idx);
    setSteps(next);
    setCurrent(Math.min(current, next.length - 1));
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSteps(prev => prev.map((s, i) => i === current ? { ...s, uploading: true } : s));
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const result: any = await uploadProcedurePhoto({ image_base64: base64, content_type: file.type || "image/jpeg" });
      if (!result?.ok) throw new Error(result?.error || "Upload failed");
      const data = result.data ?? result;
      setSteps(prev => prev.map((s, i) => i === current
        ? { ...s, photo_url: data.photo_url, photo_path: data.photo_path, uploading: false }
        : s
      ));
    } catch (err: any) {
      setSteps(prev => prev.map((s, i) => i === current ? { ...s, uploading: false } : s));
      alert(err?.message || "Photo upload failed");
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError("Give this procedure a title."); setShowMeta(true); return; }
    const validSteps = steps.filter(s => s.title.trim());
    if (validSteps.length === 0) { setError("Add at least one step with a title."); return; }
    setSaving(true); setError(null);
    try {
      const res: any = await saveProcedure({
        id: isEdit ? id : undefined,
        title: title.trim(),
        category,
        visibility,
        steps: validSteps.map((s, i) => ({ ...s, step_number: i + 1 })),
      });
      if (!res?.ok) throw new Error(res?.error || "Failed to save");
      const savedId = (res.data ?? res).id || id;
      nav(`/procedures/${savedId}`);
    } catch (err: any) {
      setError(err?.message || "Failed to save");
      setSaving(false);
    }
  }

  const step = steps[current];
  const total = steps.length;
  const progress = ((current + 1) / total) * 100;

  if (loading) return (
    <div className="page fade-up">
      <div className="card" style={{ padding: "28px", textAlign: "center", marginTop: 16 }}>
        <span className="spinner" style={{ display: "block", margin: "0 auto" }} />
      </div>
    </div>
  );

  // ─── META SCREEN (title / category / visibility) ───────────────────────────
  if (showMeta) return (
    <div className="page fade-up" style={{ paddingBottom: 80 }}>
      <button onClick={() => nav("/procedures")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, marginBottom: 12, padding: 0 }}>← Procedures</button>
      <div className="page-title" style={{ marginBottom: 2 }}>{isEdit ? "Edit Procedure" : "New Procedure"}</div>
      <div className="page-subtitle" style={{ marginBottom: 20 }}>Set the basics first, then add steps.</div>

      {error && (
        <div style={{ marginBottom: 12, padding: "10px 13px", borderRadius: 10, fontSize: 13, background: "var(--danger-bg)", color: "#FFB0B0", border: "1px solid rgba(255,84,84,0.25)" }}>{error}</div>
      )}

      <div className="card" style={{ padding: "16px" }}>
        <label>
          <div className="field-label">Procedure Title</div>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. How to reset the audio rack" autoFocus />
        </label>

        <div style={{ marginTop: 14 }}>
          <div className="field-label">Category</div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {CATEGORIES.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)} style={{
                flex: 1, padding: "10px 4px", borderRadius: 10, border: "1px solid", cursor: "pointer",
                fontWeight: 600, fontSize: 14,
                borderColor: category === c ? (c === "A Side" ? "rgba(92,107,255,0.5)" : "rgba(255,182,39,0.5)") : "var(--border)",
                background: category === c ? (c === "A Side" ? "rgba(92,107,255,0.15)" : "rgba(255,182,39,0.12)") : "rgba(255,255,255,0.04)",
                color: category === c ? (c === "A Side" ? "#B0B8FF" : "#FFD07A") : "var(--muted)",
              }}>{c}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="field-label">Who can see this?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {VISIBILITY.map(v => (
              <button key={v.value} type="button" onClick={() => setVis(v.value)} style={{
                padding: "10px 14px", borderRadius: 10, border: "1px solid", cursor: "pointer",
                textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                borderColor: visibility === v.value ? "rgba(92,107,255,0.4)" : "var(--border)",
                background: visibility === v.value ? "rgba(92,107,255,0.1)" : "rgba(255,255,255,0.03)",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: visibility === v.value ? "#B0B8FF" : "var(--text)" }}>{v.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 1 }}>{v.desc}</div>
                </div>
                {visibility === v.value && <span style={{ color: "#B0B8FF", fontSize: 16 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        <button className="btn primary full" style={{ marginTop: 18 }} onClick={() => { if (!title.trim()) { setError("Title is required."); return; } setError(null); setShowMeta(false); }}>
          {isEdit ? "Continue to Steps →" : "Start Adding Steps →"}
        </button>
      </div>
    </div>
  );

  // ─── STEP BUILDER ──────────────────────────────────────────────────────────
  return (
    <div className="page fade-up" style={{ paddingBottom: 100 }}>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setShowMeta(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, padding: 0 }}>
          ← {title || "Procedure"}
        </button>
        <button
          className="btn primary"
          style={{ fontSize: 13, padding: "7px 16px" }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <><span className="spinner" /> Saving…</> : "Save Procedure"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 10, padding: "10px 13px", borderRadius: 10, fontSize: 13, background: "var(--danger-bg)", color: "#FFB0B0", border: "1px solid rgba(255,84,84,0.25)" }}>{error}</div>
      )}

      {/* Progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Step {current + 1} of {total}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted2)" }}>{title}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.08)" }}>
          <div style={{ height: "100%", borderRadius: 99, width: `${progress}%`, background: "linear-gradient(90deg, rgba(92,107,255,0.8), rgba(168,144,255,0.8))", transition: "width 0.25s ease" }} />
        </div>
      </div>

      {/* Step card */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>

        {/* Photo area */}
        <div
          onClick={() => !step.uploading && photoRef.current?.click()}
          style={{
            minHeight: step.photo_url ? 0 : 140,
            background: step.photo_url ? "none" : "rgba(255,255,255,0.03)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", position: "relative",
          }}
        >
          {step.uploading ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <span className="spinner" style={{ display: "block", margin: "0 auto 8px" }} />
              <div style={{ fontSize: 12, color: "var(--muted2)" }}>Uploading…</div>
            </div>
          ) : step.photo_url ? (
            <div style={{ position: "relative", width: "100%" }}>
              <img src={step.photo_url} alt="Step" style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }} />
              <button
                onClick={e => { e.stopPropagation(); updateStep("photo_url", ""); updateStep("photo_path", ""); }}
                style={{
                  position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%",
                  background: "rgba(0,0,0,0.7)", border: "none", cursor: "pointer",
                  color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >×</button>
              <button
                onClick={e => { e.stopPropagation(); photoRef.current?.click(); }}
                style={{
                  position: "absolute", bottom: 8, right: 8, padding: "4px 10px",
                  borderRadius: 8, background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff", fontSize: 11, cursor: "pointer",
                }}
              >Change photo</button>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 16px" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
              <div style={{ fontSize: 13, color: "var(--muted2)" }}>Tap to add a photo for this step</div>
            </div>
          )}
        </div>

        {/* Step fields */}
        <div style={{ padding: "14px 16px" }}>
          <label>
            <div className="field-label">Step Title *</div>
            <input
              className="input"
              value={step.title}
              onChange={e => updateStep("title", e.target.value)}
              placeholder="What did you just do?"
              autoFocus
            />
          </label>
          <label style={{ marginTop: 10, display: "block" }}>
            <div className="field-label">Notes / Warning (optional)</div>
            <textarea
              className="textarea"
              value={step.notes}
              onChange={e => updateStep("notes", e.target.value)}
              placeholder="Any extra detail, caution, or tip for this step…"
              style={{ minHeight: 72 }}
            />
          </label>
        </div>
      </div>

      {/* Step navigation */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button
          className="btn"
          style={{ flex: 1, opacity: current === 0 ? 0.4 : 1 }}
          disabled={current === 0}
          onClick={() => setCurrent(c => Math.max(0, c - 1))}
        >← Prev</button>
        <button
          className="btn"
          style={{ flex: 1, opacity: current === total - 1 ? 0.4 : 1 }}
          disabled={current === total - 1}
          onClick={() => setCurrent(c => Math.min(total - 1, c + 1))}
        >Next →</button>
      </div>

      {/* Step actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={addStep}>
          + Add Next Step
        </button>
        {total > 1 && (
          <button
            onClick={() => removeStep(current)}
            style={{ padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,84,84,0.25)", background: "rgba(255,84,84,0.1)", color: "#FFB0B0", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >Remove</button>
        )}
      </div>

      {/* Step dots */}
      {total <= 30 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 16, flexWrap: "wrap" }}>
          {steps.map((s, i) => (
            <button key={i} onClick={() => setCurrent(i)} title={s.title || `Step ${i + 1}`} style={{
              width: i === current ? 22 : 8, height: 8, borderRadius: 99, border: "none",
              cursor: "pointer", transition: "all 0.2s",
              background: i === current ? "rgba(92,107,255,0.9)" : s.title.trim() ? "rgba(46,232,160,0.5)" : "rgba(255,255,255,0.15)",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
