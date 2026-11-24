import React, { useEffect, useState } from "react";

/**
 * Today's SeaWorld Orlando park hours (from ThemeParks.wiki via /api/park-hours).
 * Renders nothing if the hours can't be loaded, so it never breaks a page header.
 * Re-checks every 30 minutes so an always-on screen rolls over to the next day.
 */
type Hours = { ok: boolean; open?: boolean; label?: string; extras?: { name: string; label: string }[] };

const REFRESH_MS = 30 * 60 * 1000;

export default function ParkHours({ variant = "pill", style }: {
  /** "pill" for page headers, "tv" for the large office dashboard */
  variant?: "pill" | "tv";
  style?: React.CSSProperties;
}) {
  const [hours, setHours] = useState<Hours | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/park-hours");
        const data = await res.json();
        if (alive && data?.ok) setHours(data);
      } catch { /* keep whatever we had */ }
    }
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!hours?.label) return null;

  const extras = (hours.extras || []).map(e => `${e.name} ${e.label}`).join(" · ");
  const closed = hours.open === false;

  if (variant === "tv") {
    return (
      <div style={{ textAlign: "right", ...style }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6b7280" }}>
          Park hours today
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: closed ? "#fca5a5" : "#7EEFC4" }}>
          🎢 {hours.label}
        </div>
        {extras && <div style={{ fontSize: 9, color: "#6b7280", textTransform: "capitalize" }}>{extras}</div>}
      </div>
    );
  }

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 6,
      marginTop: 8, padding: "5px 12px", borderRadius: 20,
      background: closed ? "rgba(248,113,113,0.1)" : "rgba(46,232,160,0.1)",
      border: `1px solid ${closed ? "rgba(248,113,113,0.25)" : "rgba(46,232,160,0.25)"}`,
      fontSize: 12, lineHeight: 1.4,
      ...style,
    }}>
      <span style={{ color: "var(--muted)", fontWeight: 600 }}>🎢 Park hours today</span>
      <span style={{ color: closed ? "#f87171" : "#7EEFC4", fontWeight: 700 }}>{hours.label}</span>
      {extras && <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>· {extras}</span>}
    </div>
  );
}
