import { describe, expect, it } from "vitest";
import { getLiveBelgradeArrivals } from "./belgrade-arrivals.ts";
import type { BelgradeArrival } from "../api.ts";

const arrival = (
  lineNumber: string,
  estimatedAt: string | null,
  isEstimated: boolean,
): BelgradeArrival => ({
  lineNumber,
  transportType: "bus",
  destination: null,
  scheduledAt: "2026-10-29T12:00:00.000Z",
  estimatedAt,
  vehicleId: isEstimated ? `vehicle-${lineNumber}` : null,
  isEstimated,
  route: null,
});

describe("getLiveBelgradeArrivals", () => {
  it("keeps recent estimates and excludes scheduled or stale arrivals", () => {
    const now = Date.parse("2026-10-29T12:00:00.000Z");
    const soon = arrival("31", "2026-10-29T12:02:00.000Z", true);
    const due = arrival("30", "2026-10-29T12:01:00.000Z", true);

    expect(
      getLiveBelgradeArrivals(
        [
          arrival("scheduled", null, false),
          arrival("stale", "2026-10-29T11:58:59.000Z", true),
          soon,
          due,
        ],
        now,
      ),
    ).toEqual([due, soon]);
  });
});
