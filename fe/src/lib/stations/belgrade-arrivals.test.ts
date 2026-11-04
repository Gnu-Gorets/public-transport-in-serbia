import { describe, expect, it } from "vitest";
import {
  getBelgradeArrivalKey,
  getLiveBelgradeArrivals,
} from "./belgrade-arrivals.ts";
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
  it("uses distinct keys for vehicles without scheduled times", () => {
    const first = {
      ...arrival("77", "2026-10-29T12:02:00.000Z", true),
      scheduledAt: null,
      vehicleId: "vehicle-1",
    };
    const second = {
      ...arrival("77", "2026-10-29T12:03:00.000Z", true),
      scheduledAt: null,
      vehicleId: "vehicle-2",
    };

    expect(getBelgradeArrivalKey(first)).not.toBe(
      getBelgradeArrivalKey(second),
    );
  });

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
