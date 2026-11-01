import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBelgradeRoute,
  getBelgradeVehicles,
  getRoute,
  getStations,
} from "./api.ts";

describe("getStations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes station ids and missing lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          station: { name: "Station", id: 123, coords: [1, 2] },
        }),
      }),
    );

    await expect(getStations("ns")).resolves.toEqual([
      { name: "Station", id: "123", uid: "station", coords: [1, 2], lines: [] },
    ]);
  });
});

describe("route APIs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests route geometry for selected line and direction", async () => {
    const route = {
      segments: [
        [
          [44.8, 20.4],
          [44.9, 20.5],
        ],
      ],
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => route,
    });
    vi.stubGlobal("fetch", fetch);

    await expect(getBelgradeRoute("123", "456", "789")).resolves.toEqual(route);
    expect(fetch).toHaveBeenCalledWith("/api/bg/routes/123/456?stopId=789", {
      signal: undefined,
    });
  });

  it("requests road geometry with longitude-first coordinates", async () => {
    const response = { routes: [] };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    });
    vi.stubGlobal("fetch", fetch);

    await expect(
      getRoute([
        [44.8, 20.4],
        [44.9, 20.5],
      ]),
    ).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "/api/route?coords=20.4%2C44.8%3B20.5%2C44.9",
      { signal: undefined },
    );
  });
});

describe("getBelgradeVehicles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests live vehicles for a Belgrade stop", async () => {
    const response = {
      vehicles: [{ id: "bus-1", lineNumber: "30", coords: [44.8, 20.4] }],
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    });
    vi.stubGlobal("fetch", fetch);

    await expect(getBelgradeVehicles("1555437089")).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith("/api/bg/vehicles?stopId=1555437089", {
      signal: undefined,
    });
  });
});
