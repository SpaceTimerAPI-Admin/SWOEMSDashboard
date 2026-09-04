/**
 * Theme engine — applies per-user color scheme and background image.
 * Reads from server on login, falls back to localStorage for instant load.
 */

export type ThemePreset = "hos" | "classic" | "purple" | "forest" | "slate" | "custom";

export interface UserPreferences {
  theme?: ThemePreset;
  primaryColor?: string;
  backgroundImage?: string;
  backgroundOpacity?: number;
}

export const PRESETS: {
  id: ThemePreset; label: string; emoji: string;
  primary: string; primary2: string;
  bg0: string; bg1: string;
  border: string; borderStrong: string;
  text: string; muted: string; muted2: string;
  glow: string; navBg: string;
  gradient: string;
}[] = [
  {
    id: "hos", label: "Howl-O-Scream", emoji: "🎃",
    primary: "#CC1111", primary2: "#E82020",
    bg0: "#0a0000", bg1: "#120000",
    border: "rgba(255,60,60,0.15)", borderStrong: "rgba(255,60,60,0.28)",
    text: "#FFE8E8", muted: "rgba(255,200,200,0.65)", muted2: "rgba(255,180,180,0.4)",
    glow: "rgba(204,17,17,0.35)", navBg: "rgba(8,0,0,0.92)",
    gradient: "radial-gradient(ellipse 800px 600px at 15% -5%, rgba(180,0,0,.25) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(120,0,0,.15) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(160,0,0,.2) 0%, transparent 60%), linear-gradient(180deg, #120000 0%, #0a0000 100%)",
  },
  {
    id: "classic", label: "Classic Blue", emoji: "🌊",
    primary: "#5C6BFF", primary2: "#7880FF",
    bg0: "#060912", bg1: "#0a0f24",
    border: "rgba(255,255,255,0.09)", borderStrong: "rgba(255,255,255,0.15)",
    text: "#EBF0FF", muted: "rgba(200,210,255,0.65)", muted2: "rgba(200,210,255,0.45)",
    glow: "rgba(92,107,255,0.25)", navBg: "rgba(6,9,18,0.88)",
    gradient: "radial-gradient(ellipse 800px 600px at 15% -5%, rgba(92,107,255,.2) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(46,232,160,.1) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(92,107,255,.15) 0%, transparent 60%), linear-gradient(180deg, #0a0f24 0%, #060912 100%)",
  },
  {
    id: "purple", label: "Deep Purple", emoji: "🔮",
    primary: "#8B5CF6", primary2: "#A78BFA",
    bg0: "#07030f", bg1: "#0f0720",
    border: "rgba(139,92,246,0.18)", borderStrong: "rgba(139,92,246,0.32)",
    text: "#F0EAFF", muted: "rgba(220,210,255,0.65)", muted2: "rgba(200,190,255,0.45)",
    glow: "rgba(139,92,246,0.3)", navBg: "rgba(7,3,15,0.9)",
    gradient: "radial-gradient(ellipse 800px 600px at 15% -5%, rgba(139,92,246,.2) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(167,139,250,.1) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(139,92,246,.15) 0%, transparent 60%), linear-gradient(180deg, #0f0720 0%, #07030f 100%)",
  },
  {
    id: "forest", label: "Forest", emoji: "🌿",
    primary: "#10B981", primary2: "#34D399",
    bg0: "#030a06", bg1: "#061510",
    border: "rgba(16,185,129,0.18)", borderStrong: "rgba(16,185,129,0.32)",
    text: "#E8FFF5", muted: "rgba(180,240,220,0.65)", muted2: "rgba(160,220,200,0.45)",
    glow: "rgba(16,185,129,0.3)", navBg: "rgba(3,10,6,0.9)",
    gradient: "radial-gradient(ellipse 800px 600px at 15% -5%, rgba(16,185,129,.2) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(52,211,153,.1) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(16,185,129,.15) 0%, transparent 60%), linear-gradient(180deg, #061510 0%, #030a06 100%)",
  },
  {
    id: "slate", label: "Midnight", emoji: "🌙",
    primary: "#64748B", primary2: "#94A3B8",
    bg0: "#050709", bg1: "#0c1117",
    border: "rgba(255,255,255,0.08)", borderStrong: "rgba(255,255,255,0.15)",
    text: "#E2E8F0", muted: "rgba(200,210,220,0.65)", muted2: "rgba(180,190,200,0.45)",
    glow: "rgba(100,116,139,0.25)", navBg: "rgba(5,7,9,0.92)",
    gradient: "radial-gradient(ellipse 800px 600px at 15% -5%, rgba(100,116,139,.15) 0%, transparent 60%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(100,116,139,.1) 0%, transparent 60%), linear-gradient(180deg, #0c1117 0%, #050709 100%)",
  },
];

const PREF_CACHE_KEY = "swoems_prefs_cache";

export function getCachedPrefs(): UserPreferences {
  try { return JSON.parse(localStorage.getItem(PREF_CACHE_KEY) || "{}"); } catch { return {}; }
}
export function setCachedPrefs(prefs: UserPreferences) {
  try { localStorage.setItem(PREF_CACHE_KEY, JSON.stringify(prefs)); } catch {}
}
export function clearCachedPrefs() {
  try { localStorage.removeItem(PREF_CACHE_KEY); } catch {}
}

/** Parse a hex color into r,g,b components */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Darken a hex color by a ratio 0-1 */
function darken(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - ratio))},${Math.round(g * (1 - ratio))},${Math.round(b * (1 - ratio))})`;
}

export function applyTheme(prefs: UserPreferences) {
  const root = document.documentElement;

  // Resolve which preset to use (custom falls back to classic for structural vars)
  const isCustom = prefs.theme === "custom";
  const basePreset = PRESETS.find(p => p.id === prefs.theme) || PRESETS.find(p => p.id === "classic")!;
  const preset = isCustom ? { ...PRESETS[1] } : basePreset; // start from classic for custom

  let primary   = isCustom && prefs.primaryColor ? prefs.primaryColor : preset.primary;
  let primary2  = isCustom && prefs.primaryColor ? prefs.primaryColor : preset.primary2;

  // For custom, derive all color-dependent vars from the chosen primary
  let border        = preset.border;
  let borderStrong  = preset.borderStrong;
  let glow          = preset.glow;
  let navBg         = preset.navBg;
  let gradient      = preset.gradient;

  if (isCustom && prefs.primaryColor) {
    const [r, g, b] = hexToRgb(prefs.primaryColor);
    border       = `rgba(${r},${g},${b},0.2)`;
    borderStrong = `rgba(${r},${g},${b},0.35)`;
    glow         = `rgba(${r},${g},${b},0.3)`;
    navBg        = `rgba(4,4,8,0.92)`;
    gradient     = `radial-gradient(ellipse 800px 600px at 15% -5%, rgba(${r},${g},${b},.2) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(${r},${g},${b},.1) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(${r},${g},${b},.15) 0%, transparent 60%), linear-gradient(180deg, #0a0f20 0%, #060810 100%)`;
  }

  // ── Apply all CSS variables ───────────────────────────────────────────────
  root.style.setProperty("--primary",       primary);
  root.style.setProperty("--primary2",      primary2);
  root.style.setProperty("--primary-glow",  glow);
  root.style.setProperty("--bg0",           isCustom ? "#060810" : preset.bg0);
  root.style.setProperty("--bg1",           isCustom ? "#0a0f20" : preset.bg1);
  root.style.setProperty("--border",        border);
  root.style.setProperty("--border-strong", borderStrong);
  root.style.setProperty("--text",          isCustom ? "#EBF0FF" : preset.text);
  root.style.setProperty("--muted",         isCustom ? "rgba(200,210,255,0.65)" : preset.muted);
  root.style.setProperty("--muted2",        isCustom ? "rgba(200,210,255,0.45)" : (preset as any).muted2 || preset.muted);
  root.style.setProperty("--nav-bg",        navBg);

  // Derived accent vars used by chips, nav active, tag buttons, page-btn active, input focus
  const [r, g, b] = hexToRgb(primary);
  root.style.setProperty("--accent-chip-bg",    `rgba(${r},${g},${b},0.14)`);
  root.style.setProperty("--accent-chip-border", `rgba(${r},${g},${b},0.28)`);
  root.style.setProperty("--accent-chip-text",   `rgba(${r},${g},${b},1)`);
  root.style.setProperty("--accent-nav-bg",      `rgba(${r},${g},${b},0.16)`);
  root.style.setProperty("--accent-nav-border",  `rgba(${r},${g},${b},0.28)`);
  root.style.setProperty("--accent-input-focus", `rgba(${r},${g},${b},0.5)`);
  root.style.setProperty("--accent-input-ring",  `rgba(${r},${g},${b},0.12)`);
  root.style.setProperty("--accent-tag-active-bg",     `rgba(${r},${g},${b},0.16)`);
  root.style.setProperty("--accent-tag-active-border",  `rgba(${r},${g},${b},0.35)`);
  root.style.setProperty("--accent-page-btn-bg",   `rgba(${r},${g},${b},0.2)`);
  root.style.setProperty("--accent-page-btn-border", `rgba(${r},${g},${b},0.38)`);

  // ── Card backgrounds ─────────────────────────────────────────────────────
  root.style.setProperty("--card-bg",       `linear-gradient(145deg, rgba(${r},${g},${b},0.07) 0%, rgba(${r},${g},${b},0.03) 100%)`);
  root.style.setProperty("--card-bg-hover", `linear-gradient(145deg, rgba(${r},${g},${b},0.10) 0%, rgba(${r},${g},${b},0.05) 100%)`);
  root.style.setProperty("--home-tile-bg",  `linear-gradient(145deg, rgba(${r},${g},${b},0.08) 0%, rgba(${r},${g},${b},0.03) 100%)`);

  // ── Button primary ────────────────────────────────────────────────────────
  root.style.setProperty("--btn-primary-bg",     `linear-gradient(135deg, ${primary2}, ${primary})`);
  root.style.setProperty("--btn-primary-border", `rgba(${r},${g},${b},0.5)`);
  root.style.setProperty("--btn-primary-shadow", `rgba(${r},${g},${b},0.4)`);

  // ── Body background ───────────────────────────────────────────────────────
  document.body.style.background = gradient;
  document.body.style.backgroundAttachment = "fixed";

  // ── Background image overlay ──────────────────────────────────────────────
  let bgEl = document.getElementById("swoems-bg-layer") as HTMLDivElement | null;
  if (!bgEl) {
    bgEl = document.createElement("div");
    bgEl.id = "swoems-bg-layer";
    bgEl.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;transition:opacity 0.3s;";
    document.body.prepend(bgEl);
  }

  if (prefs.backgroundImage) {
    const opacity = (prefs.backgroundOpacity ?? 60) / 100;
    bgEl.style.background = `url(${prefs.backgroundImage}) center/cover no-repeat`;
    bgEl.style.opacity = String(opacity);
  } else {
    bgEl.style.background = "";
    bgEl.style.opacity = "0";
  }
}
