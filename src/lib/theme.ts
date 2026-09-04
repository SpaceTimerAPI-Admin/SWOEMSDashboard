/**
 * Theme engine — applies per-user color scheme and background image.
 * Reads from server on login, falls back to localStorage for instant load.
 */

export type ThemePreset = "hos" | "classic" | "purple" | "forest" | "slate" | "custom";

export interface UserPreferences {
  theme?: ThemePreset;
  primaryColor?: string;   // hex, used when theme = "custom"
  backgroundImage?: string; // base64 data URL or ""
  backgroundOpacity?: number; // 0-100
}

export const PRESETS: { id: ThemePreset; label: string; emoji: string; primary: string; primary2: string; bg0: string; bg1: string; border: string; text: string; muted: string; glow: string }[] = [
  {
    id: "hos",
    label: "Howl-O-Scream",
    emoji: "🎃",
    primary: "#CC1111", primary2: "#E82020",
    bg0: "#0a0000", bg1: "#120000",
    border: "rgba(255,60,60,0.15)",
    text: "#FFE8E8", muted: "rgba(255,200,200,0.65)",
    glow: "rgba(204,17,17,0.35)",
  },
  {
    id: "classic",
    label: "Classic Blue",
    emoji: "🌊",
    primary: "#5C6BFF", primary2: "#7880FF",
    bg0: "#060912", bg1: "#0a0f24",
    border: "rgba(255,255,255,0.09)",
    text: "#EBF0FF", muted: "rgba(200,210,255,0.65)",
    glow: "rgba(92,107,255,0.25)",
  },
  {
    id: "purple",
    label: "Deep Purple",
    emoji: "🔮",
    primary: "#8B5CF6", primary2: "#A78BFA",
    bg0: "#07030f", bg1: "#0f0720",
    border: "rgba(139,92,246,0.18)",
    text: "#F0EAFF", muted: "rgba(220,210,255,0.65)",
    glow: "rgba(139,92,246,0.3)",
  },
  {
    id: "forest",
    label: "Forest",
    emoji: "🌿",
    primary: "#10B981", primary2: "#34D399",
    bg0: "#030a06", bg1: "#061510",
    border: "rgba(16,185,129,0.18)",
    text: "#E8FFF5", muted: "rgba(180,240,220,0.65)",
    glow: "rgba(16,185,129,0.3)",
  },
  {
    id: "slate",
    label: "Midnight",
    emoji: "🌙",
    primary: "#64748B", primary2: "#94A3B8",
    bg0: "#050709", bg1: "#0c1117",
    border: "rgba(255,255,255,0.08)",
    text: "#E2E8F0", muted: "rgba(200,210,220,0.65)",
    glow: "rgba(100,116,139,0.25)",
  },
];

const PREF_CACHE_KEY = "swoems_prefs_cache";

export function getCachedPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREF_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function setCachedPrefs(prefs: UserPreferences) {
  try { localStorage.setItem(PREF_CACHE_KEY, JSON.stringify(prefs)); } catch {}
}

export function clearCachedPrefs() {
  try { localStorage.removeItem(PREF_CACHE_KEY); } catch {}
}

export function applyTheme(prefs: UserPreferences) {
  const root = document.documentElement;
  const preset = PRESETS.find(p => p.id === prefs.theme) || PRESETS[0];

  let primary = preset.primary;
  let primary2 = preset.primary2;

  if (prefs.theme === "custom" && prefs.primaryColor) {
    primary = prefs.primaryColor;
    primary2 = prefs.primaryColor;
  }

  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary2", primary2);
  root.style.setProperty("--primary-glow", preset.glow);
  root.style.setProperty("--bg0", preset.bg0);
  root.style.setProperty("--bg1", preset.bg1);
  root.style.setProperty("--border", preset.border);
  root.style.setProperty("--border-strong", preset.border.replace("0.15", "0.28").replace("0.18", "0.32").replace("0.08", "0.15").replace("0.09", "0.15"));
  root.style.setProperty("--text", preset.text);
  root.style.setProperty("--muted", preset.muted);

  // Gradient backgrounds per theme
  const gradients: Record<ThemePreset | "custom", string> = {
    hos:     `radial-gradient(ellipse 800px 600px at 15% -5%, rgba(180,0,0,.25) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(120,0,0,.15) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(160,0,0,.2) 0%, transparent 60%), linear-gradient(180deg, ${preset.bg1} 0%, ${preset.bg0} 100%)`,
    classic: `radial-gradient(ellipse 800px 600px at 15% -5%, rgba(92,107,255,.2) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(46,232,160,.1) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(92,107,255,.15) 0%, transparent 60%), linear-gradient(180deg, ${preset.bg1} 0%, ${preset.bg0} 100%)`,
    purple:  `radial-gradient(ellipse 800px 600px at 15% -5%, rgba(139,92,246,.2) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(167,139,250,.1) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(139,92,246,.15) 0%, transparent 60%), linear-gradient(180deg, ${preset.bg1} 0%, ${preset.bg0} 100%)`,
    forest:  `radial-gradient(ellipse 800px 600px at 15% -5%, rgba(16,185,129,.2) 0%, transparent 60%), radial-gradient(ellipse 600px 500px at 90% 5%, rgba(52,211,153,.1) 0%, transparent 55%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(16,185,129,.15) 0%, transparent 60%), linear-gradient(180deg, ${preset.bg1} 0%, ${preset.bg0} 100%)`,
    slate:   `radial-gradient(ellipse 800px 600px at 15% -5%, rgba(100,116,139,.15) 0%, transparent 60%), radial-gradient(ellipse 1000px 800px at 50% 100%, rgba(100,116,139,.1) 0%, transparent 60%), linear-gradient(180deg, ${preset.bg1} 0%, ${preset.bg0} 100%)`,
    custom:  `radial-gradient(ellipse 800px 600px at 15% -5%, rgba(92,107,255,.15) 0%, transparent 60%), linear-gradient(180deg, #0a0f24 0%, #060912 100%)`,
  };

  // Apply background
  let bgEl = document.getElementById("swoems-bg-layer") as HTMLDivElement | null;
  if (!bgEl) {
    bgEl = document.createElement("div");
    bgEl.id = "swoems-bg-layer";
    bgEl.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;";
    document.body.prepend(bgEl);
  }

  const opacity = (prefs.backgroundOpacity ?? 60) / 100;

  if (prefs.backgroundImage) {
    bgEl.style.background = `url(${prefs.backgroundImage}) center/cover no-repeat`;
    bgEl.style.opacity = String(opacity);
    document.body.style.background = gradients[prefs.theme || "hos"];
    document.body.style.backgroundAttachment = "fixed";
  } else {
    bgEl.style.background = "";
    bgEl.style.opacity = "1";
    document.body.style.background = gradients[prefs.theme || "hos"];
    document.body.style.backgroundAttachment = "fixed";
  }

  // Nav background
  const navBg = prefs.theme === "classic" ? "rgba(6,9,18,0.88)" :
                prefs.theme === "purple"  ? "rgba(7,3,15,0.9)" :
                prefs.theme === "forest"  ? "rgba(3,10,6,0.9)" :
                prefs.theme === "slate"   ? "rgba(5,7,9,0.9)" :
                "rgba(8,0,0,0.92)";
  root.style.setProperty("--nav-bg", navBg);
}
