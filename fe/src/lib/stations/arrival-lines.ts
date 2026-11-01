import type { VehicleArrival } from "#lib/api.ts";

export function groupArrivalLines(vehicles: VehicleArrival[]) {
  const grouped = new Map<string, VehicleArrival[]>();
  for (const vehicle of vehicles) {
    const line = String(vehicle.lineNumber);
    grouped.set(line, [...(grouped.get(line) || []), vehicle]);
  }

  return [...grouped.entries()]
    .map(([lineNumber, arrivals]) => ({
      lineNumber,
      name: arrivals[0]?.lineName || lineNumber,
      vehicles: arrivals.sort(
        (a, b) => Number(a.secondsLeft) - Number(b.secondsLeft),
      ),
    }))
    .sort((a, b) => {
      const etaA = Number(a.vehicles[0]?.secondsLeft);
      const etaB = Number(b.vehicles[0]?.secondsLeft);
      const difference =
        (Number.isFinite(etaA) ? etaA : Infinity) -
        (Number.isFinite(etaB) ? etaB : Infinity);
      return (
        difference ||
        a.lineNumber.localeCompare(b.lineNumber, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    });
}
