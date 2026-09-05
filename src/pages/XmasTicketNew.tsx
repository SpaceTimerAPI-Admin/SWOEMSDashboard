import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function XmasTicketNew() {
  const navigate = useNavigate();
  const profile = getProfile();

  const [techName, setTechName]       = useState(profile?.name || "");
  const [location, setLocation]       = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto]             = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [step, setStep]               = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!techName.trim())   return setError("Name is required");
    if (!location.trim())   return setError("Location is required");
    if (!description.trim()) return setError("Description is required");
    if (!photo)              return setError("Photo is required");

    setLoading(true);
    try {
      // Grab GPS silently in parallel with photo compression
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

      setStep("Creating ticket…");
      const createRes = await apiFetch("/api/xmas-create-ticket", {
        method: "POST",
        body: JSON.stringify({
          tech_name: techName.trim(),
          location_friendly: location.trim(),
          description: description.trim(),
          photo_url: uploadRes.publicUrl,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
        }),
      });
      if (!createRes.ok) throw new Error(createRes.error || "Failed to create ticket");

      navigate(`/christmas/${createRes.id}`);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
      setStep(null);
    }
  }

  return (
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
          📍 GPS location will be captured automatically if you allow it — helps track where issues are on the map.
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
  );
}
