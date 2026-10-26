import { describe, expect, it } from "vitest";

const { belgradeStops, validateStops } = require("../server/services/belgradeStopsService");
const source = require("../server/data/yandex-belgrade-bus-stops.json");

describe("Belgrade stop catalog", () => {
  it("validates and exports the Yandex bus stop source", () => {
    expect(belgradeStops).toBe(source);
    expect(belgradeStops.stops).toHaveLength(1083);
    expect(belgradeStops.stops.every((stop) => stop.routes.length > 0)).toBe(true);
  });

  it("rejects duplicate IDs and invalid coordinates", () => {
    const stop = { id: "1", name: "Stop", coords: [44.8, 20.4] };
    expect(() => validateStops({ updatedAt: "2026-10-26", stops: [stop, stop] })).toThrow();
    expect(() => validateStops({ updatedAt: "2026-10-26", stops: [{ ...stop, coords: [0, 0] }] })).toThrow();
  });
});
