import type { BelgradeArrival } from "../api.ts";

export function getLiveBelgradeArrivals(
  arrivals: BelgradeArrival[],
  now = Date.now(),
): BelgradeArrival[] {
  return arrivals
    .filter((arrival) => {
      const timestamp = Date.parse(
        arrival.estimatedAt || arrival.scheduledAt || "",
      );
      return (
        arrival.isEstimated &&
        Number.isFinite(timestamp) &&
        timestamp >= now - 60_000
      );
    })
    .sort((a, b) => {
      const aLine = String(a.lineNumber).match(/^(\d+)(\D*)/) || [];
      const bLine = String(b.lineNumber).match(/^(\d+)(\D*)/) || [];
      return (
        Number(aLine[1] ?? Infinity) - Number(bLine[1] ?? Infinity) ||
        String(aLine[2] || a.lineNumber).localeCompare(
          String(bLine[2] || b.lineNumber),
        ) ||
        Date.parse(a.estimatedAt || a.scheduledAt || "") -
          Date.parse(b.estimatedAt || b.scheduledAt || "")
      );
    });
}
