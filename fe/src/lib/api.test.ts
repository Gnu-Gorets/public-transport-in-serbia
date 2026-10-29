import { afterEach, describe, expect, it, vi } from "vitest";
import { getBelgradeVehicles, getStations } from "./api.ts";

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
