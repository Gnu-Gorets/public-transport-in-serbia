import { describe, expect, it } from "vitest";
import { getCatalogStopName } from "../src/lib/api.ts";
import { hasFavorite, toggleFavorite } from "../src/lib/state/favorites.ts";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from "../src/lib/state/preferences.ts";

describe("Belgrade catalog names", () => {
  it("prefers catalog name over upstream name for the same stop ID", () => {
    expect(
      getCatalogStopName(
        [{ id: "1555437089", name: "Železnički bulevar · 640" }],
        "1555437089",
        "Južni bulevar · 640",
      ),
    ).toBe("Železnički bulevar · 640");
  });
});

describe("preferences state", () => {
  it("loads defaults when storage is empty or unavailable", () => {
    expect(loadPreferences({ getItem: () => null })).toEqual(
      DEFAULT_PREFERENCES,
    );
    expect(
      loadPreferences({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual(DEFAULT_PREFERENCES);
  });

  it("normalizes stored values and clamps range and hue", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          cityId: "bg",
          rangeMeters: 1075,
          theme: "dark",
          accent: { hue: 400 },
        }),
    };
    expect(loadPreferences(storage)).toEqual({
      cityId: "bg",
      rangeMeters: 1000,
      theme: "dark",
      accent: { hue: 360 },
    });
    const rounded = {
      getItem: () =>
        JSON.stringify({ rangeMeters: 326, theme: "bad", accent: { hue: -2 } }),
    };
    expect(loadPreferences(rounded)).toEqual({
      ...DEFAULT_PREFERENCES,
      rangeMeters: 350,
      accent: { hue: 0 },
    });
  });

  it("saves normalized preferences and tolerates blocked storage", () => {
    let saved = "";
    const result = savePreferences(
      {
        setItem: (_key, value) => {
          saved = value;
        },
      },
      {
        cityId: "bg",
        rangeMeters: 99,
        theme: "light",
        accent: "device-blue",
      },
    );
    expect(result.rangeMeters).toBe(100);
    expect(JSON.parse(saved)).toEqual(result);
    expect(
      savePreferences(
        {
          setItem: () => {
            throw new Error("blocked");
          },
        },
        result,
      ),
    ).toEqual(result);
  });
});

describe("favorite state", () => {
  it("checks and toggles IDs without mutating the input", () => {
    const favorites = ["a", "b"];
    expect(hasFavorite(favorites, "a")).toBe(true);
    expect(toggleFavorite(favorites, "a")).toEqual(["b"]);
    expect(toggleFavorite(favorites, "c")).toEqual(["a", "b", "c"]);
    expect(favorites).toEqual(["a", "b"]);
  });
});
