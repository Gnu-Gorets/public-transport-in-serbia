import { describe, expect, it } from "vitest";

const { belgradeStops, validateStops } = require("../server/services/belgradeStopsService");
const source = require("../server/data/yandex-belgrade-bus-stops.json");

describe("Belgrade stop catalog", () => {
  it("validates and exports the Yandex bus stop source", () => {
    expect(belgradeStops).toBe(source);
    expect(belgradeStops.stops).toHaveLength(1759);
    expect(belgradeStops.routes.filter(({ type }) => type === "bus")).toHaveLength(55);
    expect(belgradeStops.routes.filter(({ type }) => type === "tram")).toHaveLength(9);
    expect(belgradeStops.routes.filter(({ type }) => type === "minibus")).toHaveLength(2);
    const routeNames = new Set(belgradeStops.routes.map(({ route }) => route));
    expect(belgradeStops.stops.every((stop) => stop.routes.length > 0 && stop.routes.every((route) => routeNames.has(route.replace(/^(?:tram|minibus):/, ""))))).toBe(true);
    expect(belgradeStops.routes.filter(({ type }) => type === "bus").every((route) =>
      belgradeStops.stops.some((stop) => stop.routes.includes(route.route)),
    )).toBe(true);
    expect(belgradeStops.routes.filter(({ type }) => type === "tram").every((route) =>
      belgradeStops.stops.some((stop) => stop.routes.includes(`tram:${route.route}`)),
    )).toBe(true);
    expect(belgradeStops.routes.filter(({ type }) => type === "minibus").every((route) =>
      belgradeStops.stops.some((stop) => stop.routes.includes(`minibus:${route.route}`)),
    )).toBe(true);
  });

  it("rejects duplicate IDs and invalid coordinates", () => {
    const stop = { id: "1", name: "Stop", coords: [44.8, 20.4] };
    expect(() => validateStops({ updatedAt: "2026-10-26", stops: [stop, stop] })).toThrow();
    expect(() => validateStops({ updatedAt: "2026-10-26", stops: [{ ...stop, coords: [0, 0] }] })).toThrow();
  });
});
