import React, { useRef, useState } from "react";

const SITE_URL = (import.meta.env.VITE_SITE_BASE_URL || "").replace(/\/$/, "");

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return data;
}

export default function PublicWorkOrder() {
  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [email, setEmail]             = useState("");
  const [department, setDepartment]   = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto]             = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();
    const dep = department.trim();
    const desc = description.trim();

    if (!fn)   return setError("First name is required.");
    if (!ln)   return setError("Last name is required.");
    if (!em || !em.includes("@")) return setError("A valid email is required.");
    if (!dep)  return setError("Department is required.");
    if (!desc) return setError("Description is required.");

    setLoading(true);

    try {
      let storagePath: string | null = null;

      // Upload photo first if attached
      if (photo) {
        setUploadProgress("Uploading photo…");
        const urlRes = await apiFetch("/api/public-work-order-photo", {
          method: "POST",
          body: JSON.stringify({ filename: photo.name, content_type: photo.type || "image/jpeg" }),
        });

        if (!urlRes.ok || !urlRes.upload_url) {
          throw new Error(urlRes.error || "Failed to get upload URL");
        }

        const uploadRes = await fetch(urlRes.upload_url, {
          method: "PUT",
          headers: { "Content-Type": photo.type || "image/jpeg" },
          body: photo,
        });

        if (!uploadRes.ok) throw new Error("Photo upload failed");
        storagePath = urlRes.storage_path;
        setUploadProgress(null);
      }

      setUploadProgress("Submitting work order…");
      const res = await apiFetch("/api/public-work-order", {
        method: "POST",
        body: JSON.stringify({
          first_name: fn, last_name: ln,
          email: em, department: dep,
          description: desc,
          storage_path: storagePath,
        }),
      });

      if (!res.ok) throw new Error(res.error || "Submission failed");

      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{
        minHeight: "100svh", background: "#060912", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: "#e5e7eb", fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>
            Work Order Submitted
          </h2>
          <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
            Your request has been received. Our maintenance team has been notified
            and will follow up at the email you provided.
          </p>
          <p style={{ color: "#6b7280", fontSize: 12 }}>
            Expected response within 3 business days.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100svh", background: "#060912",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#e5e7eb",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, rgba(92,107,255,0.15) 0%, rgba(46,232,160,0.06) 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "24px 20px 20px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          SeaWorld Entertainment
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em" }}>
          🔧 Maintenance Work Order
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9ca3af" }}>
          Submit a maintenance request to our team
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px 48px" }}>

        {/* Name row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>First Name <span style={{ color: "#f87171" }}>*</span></label>
            <input
              style={inputStyle} type="text" placeholder="First name"
              value={firstName} onChange={e => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name <span style={{ color: "#f87171" }}>*</span></label>
            <input
              style={inputStyle} type="text" placeholder="Last name"
              value={lastName} onChange={e => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>

        {/* Email */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email <span style={{ color: "#f87171" }}>*</span></label>
          <input
            style={inputStyle} type="email" placeholder="your@email.com"
            value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" inputMode="email"
          />
        </div>

        {/* Department */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Department <span style={{ color: "#f87171" }}>*</span></label>
          <input
            style={inputStyle} type="text" placeholder="e.g. Aquatica Operations, Rides, F&B…"
            value={department} onChange={e => setDepartment(e.target.value)}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Description <span style={{ color: "#f87171" }}>*</span></label>
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
            placeholder="Describe the issue in detail — what's broken, where it is, when it started…"
            value={description} onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Photo */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Photo <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 400 }}>(optional)</span></label>

          {photoPreview ? (
            <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
              <img
                src={photoPreview} alt="Preview"
                style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", display: "block" }}
              />
              <button
                type="button" onClick={removePhoto}
                style={{
                  position: "absolute", top: 8, right: 8,
                  background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%",
                  width: 28, height: 28, cursor: "pointer", color: "#e5e7eb",
                  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >×</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", padding: "20px 16px", borderRadius: 10,
                border: "2px dashed rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)", cursor: "pointer",
                color: "#9ca3af", fontSize: 14, display: "flex",
                flexDirection: "column", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 24 }}>📷</span>
              <span>Tap to attach a photo</span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Take a new photo or choose from your library</span>
            </button>
          )}

          {/* Hidden file input — accept="image/*" triggers native camera/gallery picker on mobile */}
          <input
            ref={fileRef} type="file"
            accept="image/*"
            capture={undefined}
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            fontSize: 13, color: "#fca5a5",
          }}>
            {error}
          </div>
        )}

        {/* Progress */}
        {uploadProgress && (
          <div style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>
            <span style={{
              display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.1)",
              borderTopColor: "#818cf8", borderRadius: "50%",
              animation: "spin 0.7s linear infinite", marginRight: 6, verticalAlign: "middle",
            }} />
            {uploadProgress}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%", padding: "14px",
            background: loading ? "rgba(92,107,255,0.4)" : "linear-gradient(135deg, #7880FF, #5C6BFF)",
            border: "none", borderRadius: 10, color: "#fff",
            fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Submitting…" : "Submit Work Order"}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(200,210,255,0.6)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.3)",
  color: "#e5e7eb",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
