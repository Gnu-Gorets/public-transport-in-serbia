export type Theme = "system" | "light" | "dark";
export interface Preferences {
  cityId: string | null;
  rangeMeters: number;
  theme: Theme;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  cityId: null,
  rangeMeters: 400,
  theme: "system",
};

const STORAGE_KEY = "bgpp:prefs:v1";
const themes = new Set<Theme>(["system", "light", "dark"]);

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
  return { cityId, rangeMeters, theme };
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
