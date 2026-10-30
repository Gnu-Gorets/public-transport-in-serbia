import { describe, expect, it } from "vitest";
import { loadPreferences, savePreferences } from "./preferences.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("preferences", () => {
  it("saves and reloads changes made in the preferences dialog", () => {
    const storage = memoryStorage();
    savePreferences(storage, {
      cityId: "ns",
      rangeMeters: 650,
      theme: "dark",
    });

    expect(loadPreferences(storage)).toEqual({
      cityId: "ns",
      rangeMeters: 650,
      theme: "dark",
    });
  });
});
