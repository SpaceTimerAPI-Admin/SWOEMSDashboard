import React, { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getProfile } from "../lib/auth";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  return res.json();
}

async function compressImage(file: File, maxDim = 1600, quality = 0.78): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), "image/jpeg", quality));
}

async function getCoordsSafe(timeoutMs = 6000): Promise<{ lat: number; lon: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      pos => { if (!done) { done = true; clearTimeout(timer); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); } },
      ()  => { if (!done) { done = true; clearTimeout(timer); resolve(null); } },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// ── Duplicate-check modal ─────────────────────────────────────────────────────
interface NearbyTicket {
  id: number;
  location_friendly: string;
  description: string;
  tech_name: string;
  created_at: string;
  distance_m: number;
}

function DupeModal({
  nearby,
  onConfirm,
  onCancel,
}: {
  nearby: NearbyTicket[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: "#1a1b26", borderRadius: 16, padding: 22,
        maxWidth: 420, width: "100%",
        border: "1px solid rgba(251,146,60,0.35)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Warning header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fb923c" }}>Possible Duplicate</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              {nearby.length} open ticket{nearby.length !== 1 ? "s" : ""} already exist{nearby.length === 1 ? "s" : ""} near this location
            </div>
          </div>
        </div>

        {/* Nearby tickets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {nearby.map(t => (
            <div key={t.id} style={{
              padding: "11px 13px", borderRadius: 10,
              background: "rgba(251,146,60,0.07)",
              border: "1px solid rgba(251,146,60,0.2)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  #{t.id} — {t.location_friendly}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, flexShrink: 0,
                  background: "rgba(251,146,60,0.15)", color: "#fb923c",
                }}>
                  {t.distance_m < 10 ? "Same spot" : `~${t.distance_m}m away`}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 5 }}>
                {t.description}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted2)" }}>
                👤 {t.tech_name} · {fmtDate(t.created_at)}
              </div>
              <Link
                to={`/christmas/${t.id}`}
                style={{ fontSize: 11, color: "#818cf8", textDecoration: "none", marginTop: 4, display: "inline-block" }}
              >
                View ticket →
              </Link>
            </div>
          ))}
        </div>

        <div style={{
          fontSize: 13, color: "var(--muted)", padding: "10px 13px",
          background: "rgba(255,255,255,0.03)", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.07)", marginBottom: 16, lineHeight: 1.6,
        }}>
          Is your issue <strong style={{ color: "var(--text)" }}>different</strong> from the ticket{nearby.length !== 1 ? "s" : ""} above?
          If so, go ahead and submit. Otherwise, please comment on the existing ticket instead.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            ← Go Back
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10,
              background: "rgba(251,146,60,0.15)",
              border: "1px solid rgba(251,146,60,0.4)",
              color: "#fb923c", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            It's Different — Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function XmasTicketNew() {
  const navigate = useNavigate();
  const profile = getProfile();

  const [techName, setTechName]         = useState(profile?.name || "");
  const [location, setLocation]         = useState("");
  const [description, setDescription]   = useState("");
  const [photo, setPhoto]               = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [step, setStep]                 = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Duplicate-check state
  const [dupeModal, setDupeModal]     = useState<NearbyTicket[] | null>(null);
  const [pendingPayload, setPending]  = useState<any>(null); // holds data ready to submit post-confirm

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  // Phase 2: actually create the ticket (called after dupe confirm OR when no dupes found)
  async function doCreate(payload: {
    tech_name: string;
    location_friendly: string;
    description: string;
    photoUrl: string;
    coords: { lat: number; lon: number } | null;
    compressed: Blob;
    base64: string;
  }) {
    setStep("Creating ticket…");
    const createRes = await apiFetch("/api/xmas-create-ticket", {
      method: "POST",
      body: JSON.stringify({
        tech_name: payload.tech_name,
        location_friendly: payload.location_friendly,
        description: payload.description,
        photo_url: payload.photoUrl,
        lat: payload.coords?.lat ?? null,
        lon: payload.coords?.lon ?? null,
      }),
    });
    if (!createRes.ok) throw new Error(createRes.error || "Failed to create ticket");
    navigate(`/christmas/${createRes.id}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!techName.trim())    return setError("Name is required");
    if (!location.trim())    return setError("Location is required");
    if (!description.trim()) return setError("Description is required");
    if (!photo)              return setError("Photo is required");

    setLoading(true);
    try {
      setStep("Getting location & uploading photo…");
      const [coords, compressed] = await Promise.all([
        getCoordsSafe(6000),
        compressImage(photo),
      ]);

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(compressed);
      });

      const uploadRes = await apiFetch("/api/xmas-upload-photo", {
        method: "POST",
        body: JSON.stringify({ base64, contentType: "image/jpeg" }),
      });
      if (!uploadRes.publicUrl) throw new Error(uploadRes.error || "Photo upload failed");

      const payload = {
        tech_name: techName.trim(),
        location_friendly: location.trim(),
        description: description.trim(),
        photoUrl: uploadRes.publicUrl,
        coords,
        compressed,
        base64,
      };

      // ── Duplicate check ──────────────────────────────────────────────────
      if (coords) {
        setStep("Checking for nearby tickets…");
        try {
          const dupeRes = await apiFetch(
            `/api/xmas-nearby-tickets?lat=${coords.lat}&lon=${coords.lon}&radius=120`
          );
          if (dupeRes.ok && dupeRes.nearby?.length > 0) {
            // Pause and show modal — user must confirm
            setPending(payload);
            setDupeModal(dupeRes.nearby);
            setLoading(false);
            setStep(null);
            return; // don't submit yet
          }
        } catch {
          // If dupe check fails, just proceed — don't block submission
        }
      }

      // No dupes (or no GPS) — create immediately
      await doCreate(payload);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
      setStep(null);
    }
  }

  // User confirmed it's not a duplicate
  async function handleDupeConfirm() {
    if (!pendingPayload) return;
    setDupeModal(null);
    setLoading(true);
    setStep("Creating ticket…");
    try {
      await doCreate(pendingPayload);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
      setStep(null);
      setPending(null);
    }
  }

  function handleDupeCancel() {
    setDupeModal(null);
    setPending(null);
  }

  return (
    <>
      <div className="page fade-up">
        <div className="back-link" onClick={() => navigate("/christmas")} style={{ cursor: "pointer" }}>
          ← Christmas Tickets
        </div>
        <div className="page-title">New Christmas Ticket</div>
        <div className="page-subtitle">Use this when you cannot resolve a lights/decor issue yourself.</div>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 18, marginTop: 8 }}>
          <label>
            <div className="field-label">Your Name <span style={{ color: "var(--danger)" }}>*</span></div>
            <input className="input" value={techName} onChange={e => setTechName(e.target.value)} placeholder="e.g. Adam" />
          </label>

          <label>
            <div className="field-label">Location <span style={{ color: "var(--danger)" }}>*</span></div>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)}
              placeholder='e.g. "Main Gate Tree", "Entrance Arch"' />
          </label>

          <label>
            <div className="field-label">Description <span style={{ color: "var(--danger)" }}>*</span></div>
            <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What's wrong, what you already tried, etc." />
          </label>

          <div>
            <div className="field-label">Photo <span style={{ color: "var(--danger)" }}>*</span></div>
            {photoPreview ? (
              <div style={{ position: "relative", marginBottom: 10 }}>
                <img src={photoPreview} alt="Preview" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
                <button type="button"
                  onClick={() => { setPhoto(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", color: "#fff", fontSize: 16 }}>
                  ×
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} style={{
                width: "100%", padding: "18px 16px", borderRadius: 10,
                border: "2px dashed var(--border)", background: "rgba(255,255,255,0.03)",
                cursor: "pointer", color: "var(--muted)", fontSize: 14,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 10,
              }}>
                <span style={{ fontSize: 24 }}>📷</span>
                <span>Tap to take or choose photo</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPhotoChange} />
          </div>

          <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 6, marginBottom: 12 }}>
            📍 GPS location will be captured automatically if you allow it — helps track where issues are on the map and detect duplicate tickets nearby.
          </div>

          {error && (
            <div style={{ background: "var(--danger-bg)", border: "1px solid rgba(255,84,84,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FFB0B0", marginBottom: 10 }}>
              {error}
            </div>
          )}

          {step && (
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              {step}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn primary" style={{ width: "100%", marginTop: 4 }}>
            {loading ? <><span className="spinner" style={{ marginRight: 6 }} /> Submitting…</> : "Submit Ticket"}
          </button>
        </form>
      </div>

      {/* Duplicate warning modal — rendered outside page flow so it overlays everything */}
      {dupeModal && (
        <DupeModal
          nearby={dupeModal}
          onConfirm={handleDupeConfirm}
          onCancel={handleDupeCancel}
        />
      )}
    </>
  );
}
