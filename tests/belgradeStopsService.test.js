import { describe, expect, it } from "vitest";

const {
  belgradeStops,
  validateStops,
} = require("../server/services/belgradeStopsService");
const source = require("../server/data/yandex-belgrade-bus-stops.json");

describe("Belgrade stop catalog", () => {
  it("validates and exports Yandex transit stop catalog", () => {
    expect(belgradeStops).toBe(source);
    expect(belgradeStops.stops).toHaveLength(2125);
    expect(belgradeStops.routes).toHaveLength(92);
    expect(
      belgradeStops.routes.filter(({ type }) => type === "bus"),
    ).toHaveLength(77);
    expect(
      belgradeStops.routes.filter(({ type }) => type === "tram"),
    ).toHaveLength(9);
    expect(
      belgradeStops.routes.filter(({ type }) => type === "minibus"),
    ).toHaveLength(3);
    expect(
      belgradeStops.routes.filter(({ type }) => type === "trolleybus"),
    ).toHaveLength(3);
    const routeNames = new Set(belgradeStops.routes.map(({ route }) => route));
    expect(
      belgradeStops.stops.every(
        (stop) =>
          stop.routes.length > 0 &&
          stop.routes.every((route) =>
            routeNames.has(route.replace(/^(?:tram|minibus|trolleybus):/, "")),
          ),
      ),
    ).toBe(true);
    expect(
      belgradeStops.routes
        .filter(({ type }) => type === "bus")
        .every((route) =>
          belgradeStops.stops.some((stop) => stop.routes.includes(route.route)),
        ),
    ).toBe(true);
    expect(
      belgradeStops.routes
        .filter(({ type }) => type === "tram")
        .every((route) =>
          belgradeStops.stops.some((stop) =>
            stop.routes.includes(`tram:${route.route}`),
          ),
        ),
    ).toBe(true);
    expect(
      belgradeStops.routes
        .filter(({ type }) => type === "minibus")
        .every((route) =>
          belgradeStops.stops.some((stop) =>
            stop.routes.includes(`minibus:${route.route}`),
          ),
        ),
    ).toBe(true);
    expect(
      belgradeStops.routes
        .filter(({ type }) => type === "trolleybus")
        .every((route) =>
          belgradeStops.stops.some((stop) =>
            stop.routes.includes(`trolleybus:${route.route}`),
          ),
        ),
    ).toBe(true);
    expect(belgradeStops.routes).toContainEqual(
      expect.objectContaining({
        route: "511",
        lineId: "4206130163",
        type: "bus",
      }),
    );
    expect(belgradeStops.excludedRoutes).not.toContain("511");
    expect(belgradeStops.remainingRoutes).toEqual([]);
    expect(belgradeStops.complete).toBe(false);
  });

  it("rejects duplicate IDs and invalid coordinates", () => {
    const stop = { id: "1", name: "Stop", coords: [44.8, 20.4] };
    expect(() =>
      validateStops({ updatedAt: "2026-10-26", stops: [stop, stop] }),
    ).toThrow();
    expect(() =>
      validateStops({
        updatedAt: "2026-10-26",
        stops: [{ ...stop, coords: [0, 0] }],
      }),
    ).toThrow();
  });
});
