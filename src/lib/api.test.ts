import { afterEach, describe, expect, it, vi } from "vitest";
import { getBelgradeVehicles } from "./api.ts";

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
