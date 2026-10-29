export type Theme = "system" | "light" | "dark";
export type Accent = "bgpp-teal" | "device-blue" | { hue: number };

export interface Preferences {
  cityId: string | null;
  rangeMeters: number;
  theme: Theme;
  accent: Accent;
}

export function shouldOpenPreferences(search: string): boolean {
  return new URLSearchParams(search).has("preferences");
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  cityId: null,
  rangeMeters: 400,
  theme: "system",
  accent: "bgpp-teal",
};

const STORAGE_KEY = "bgpp:prefs:v1";
const themes = new Set<Theme>(["system", "light", "dark"]);
const accents = new Set(["bgpp-teal", "device-blue"]);

function normalizePreferences(value: unknown): Preferences {
  if (typeof value !== "object" || value === null)
    return { ...DEFAULT_PREFERENCES };

  const candidate = value as Partial<Preferences>;
  const cityId =
    typeof candidate.cityId === "string" && candidate.cityId.trim()
      ? candidate.cityId
      : null;
  const range = Number(candidate.rangeMeters);
  const rangeMeters = Number.isFinite(range)
    ? Math.min(1000, Math.max(100, Math.round(range / 50) * 50))
    : DEFAULT_PREFERENCES.rangeMeters;
  const theme = themes.has(candidate.theme as Theme)
    ? (candidate.theme as Theme)
    : DEFAULT_PREFERENCES.theme;
  let accent: Accent = DEFAULT_PREFERENCES.accent;
  if (typeof candidate.accent === "string" && accents.has(candidate.accent)) {
    accent = candidate.accent as Accent;
  } else if (
    typeof candidate.accent === "object" &&
    candidate.accent !== null
  ) {
    const hue = (candidate.accent as { hue?: unknown }).hue;
    if (typeof hue === "number" && Number.isFinite(hue)) {
      accent = { hue: Math.min(360, Math.max(0, Math.round(hue))) };
    }
  }

  return { cityId, rangeMeters, theme, accent };
}

export function loadPreferences(
  storage: Pick<Storage, "getItem">,
): Preferences {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return stored === null
      ? { ...DEFAULT_PREFERENCES }
      : normalizePreferences(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  storage: Pick<Storage, "setItem">,
  preferences: Preferences,
): Preferences {
  const normalized = normalizePreferences(preferences);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Preferences remain usable in memory when browser storage is unavailable.
  }
  return normalized;
}
