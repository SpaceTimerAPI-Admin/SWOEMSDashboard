import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProcedure } from "../lib/api";
import { getRole } from "../lib/auth";

export default function ProcedureView() {
  const { id } = useParams<{ id: string }>();
  const [procedure, setProcedure] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const role = getRole();
  const canEdit = role === "ems" || role === "admin";

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const res: any = await getProcedure(id);
        if (res?.ok) {
          const data = res.data ?? res;
          setProcedure(data.procedure);
          setSteps(data.steps || []);
        }
      } catch {}
      setLoading(false);
    }
    void load();
  }, [id]);

  if (loading) return (
    <div className="page fade-up">
      <Link to="/procedures" className="back-link">← Procedures</Link>
      <div className="card" style={{ padding: "28px", textAlign: "center", marginTop: 16 }}>
        <span className="spinner" style={{ display: "block", margin: "0 auto" }} />
      </div>
    </div>
  );

  if (!procedure) return (
    <div className="page fade-up">
      <Link to="/procedures" className="back-link">← Procedures</Link>
      <div className="card" style={{ padding: "24px", textAlign: "center", marginTop: 16 }}>
        <div style={{ color: "#FFB0B0" }}>Procedure not found.</div>
      </div>
    </div>
  );

  const step = steps[currentStep];
  const total = steps.length;
  const progress = total > 0 ? ((currentStep + 1) / total) * 100 : 0;

  return (
    <div className="page fade-up" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Link to="/procedures" className="back-link" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>← Procedures</Link>
        {canEdit && (
          <Link to={`/procedures/${id}/edit`} style={{
            fontSize: 12, fontWeight: 600, color: "var(--muted)", textDecoration: "none",
            padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)",
            background: "rgba(255,255,255,0.05)",
          }}>Edit</Link>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 2 }}>{procedure.title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            fontSize: 11, padding: "1px 8px", borderRadius: 99, fontWeight: 600,
            background: procedure.category === "A Side" ? "rgba(92,107,255,0.18)" : "rgba(255,182,39,0.15)",
            color: procedure.category === "A Side" ? "#B0B8FF" : "#FFD07A",
          }}>{procedure.category}</span>
          <span style={{ fontSize: 12, color: "var(--muted2)" }}>by {procedure.created_by_name}</span>
        </div>
      </div>

      {steps.length === 0 ? (
        <div className="card" style={{ padding: "28px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--muted2)" }}>No steps added yet.</div>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Step {currentStep + 1} of {total}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted2)" }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99, transition: "width 0.3s ease",
                width: `${progress}%`,
                background: "linear-gradient(90deg, rgba(92,107,255,0.8), rgba(168,144,255,0.8))",
              }} />
            </div>
          </div>

          {/* Step card */}
          {step && (
            <div className="card" style={{ padding: "0", overflow: "hidden", marginBottom: 16 }}>
              {/* Photo */}
              {step.photo_url && (
                <div
                  style={{ cursor: "pointer", background: "rgba(0,0,0,0.3)" }}
                  onClick={() => setZoomPhoto(step.photo_url)}
                >
                  <img
                    src={step.photo_url}
                    alt={`Step ${currentStep + 1}`}
                    style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }}
                  />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "4px 0", background: "rgba(0,0,0,0.4)" }}>
                    Tap to zoom
                  </div>
                </div>
              )}

              <div style={{ padding: "18px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted2)", marginBottom: 6 }}>
                  Step {currentStep + 1}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, marginBottom: step.notes ? 12 : 0 }}>
                  {step.title}
                </div>
                {step.notes && (
                  <div style={{
                    marginTop: 12, padding: "10px 13px", borderRadius: 10,
                    background: "rgba(255,182,39,0.08)", border: "1px solid rgba(255,182,39,0.2)",
                    fontSize: 13, color: "rgba(255,220,120,0.9)", lineHeight: 1.55,
                  }}>
                    ⚠️ {step.notes}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
              disabled={currentStep === 0}
              className="btn"
              style={{ flex: 1, opacity: currentStep === 0 ? 0.4 : 1 }}
            >
              ← Previous
            </button>
            {currentStep < total - 1 ? (
              <button
                onClick={() => setCurrentStep(s => s + 1)}
                className="btn primary"
                style={{ flex: 1 }}
              >
                Next →
              </button>
            ) : (
              <Link to="/procedures" className="btn primary" style={{ flex: 1, textAlign: "center", textDecoration: "none" }}>
                ✓ Done
              </Link>
            )}
          </div>

          {/* Step dots */}
          {total <= 20 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
              {steps.map((_, i) => (
                <button key={i} onClick={() => setCurrentStep(i)} style={{
                  width: i === currentStep ? 20 : 8, height: 8, borderRadius: 99, border: "none",
                  cursor: "pointer", transition: "all 0.2s",
                  background: i === currentStep ? "rgba(92,107,255,0.8)" : i < currentStep ? "rgba(46,232,160,0.5)" : "rgba(255,255,255,0.15)",
                }} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Photo zoom modal */}
      {zoomPhoto && (
        <div
          className="modal-overlay"
          onClick={() => setZoomPhoto(null)}
          style={{ background: "rgba(0,0,0,0.92)", alignItems: "flex-start", paddingTop: 40 }}
        >
          <img src={zoomPhoto} alt="Step photo" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, objectFit: "contain" }} />
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 12, textAlign: "center" }}>Tap anywhere to close</div>
        </div>
      )}
    </div>
  );
}
