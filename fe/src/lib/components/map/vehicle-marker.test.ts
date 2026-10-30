import { describe, expect, it } from "vitest";
import { vehicleMarkerLabel, vehicleMarkerWidth } from "./vehicle-marker.ts";

describe("vehicle marker label", () => {
  it("shortens routes longer than four characters", () => {
    expect(vehicleMarkerLabel("27N (Overnight)")).toBe("27N.");
    expect(vehicleMarkerLabel("AB (route)")).toBe("AB.");
    expect(vehicleMarkerLabel("ВЗТ")).toBe("ВЗТ");
    expect(vehicleMarkerWidth("27N (Overnight)")).toBe(
      vehicleMarkerWidth("12345"),
    );
    expect(vehicleMarkerWidth("12345")).toBe(53);
  });

  it("keeps short route labels unchanged", () => {
    expect(vehicleMarkerLabel("12")).toBe("12");
    expect(vehicleMarkerWidth("7")).toBe(32);
    expect(vehicleMarkerWidth("12")).toBeGreaterThan(vehicleMarkerWidth("7"));
  });
});
