import { describe, expect, it } from "vitest";
import { shouldOpenPreferences } from "./preferences.ts";

describe("preferences menu query", () => {
  it("opens only when preferences query parameter is present", () => {
    expect(shouldOpenPreferences("?preferences=1")).toBe(true);
    expect(shouldOpenPreferences("?city=ns")).toBe(false);
  });
});
