import { describe, expect, it } from "vitest";
import { vehicleMarkerWidth } from "./vehicle-marker.ts";

describe("vehicle marker width", () => {
  it("keeps one-character routes compact and expands for longer routes", () => {
    expect(vehicleMarkerWidth("7")).toBe(32);
    expect(vehicleMarkerWidth("12")).toBeGreaterThan(vehicleMarkerWidth("7"));
    expect(vehicleMarkerWidth("ВЗТ")).toBeGreaterThan(vehicleMarkerWidth("12"));
  });
});
