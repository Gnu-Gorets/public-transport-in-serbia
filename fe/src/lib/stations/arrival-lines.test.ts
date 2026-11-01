import { describe, expect, it } from "vitest";
import type { VehicleArrival } from "#lib/api.ts";
import { groupArrivalLines } from "./arrival-lines.ts";

function vehicle(lineNumber: string, secondsLeft: number): VehicleArrival {
  return {
    lineNumber,
    lineName: `Line ${lineNumber}`,
    secondsLeft,
    stationsBetween: 0,
    main_line_title: lineNumber,
    coords: null,
    allStations: [],
  };
}

describe("groupArrivalLines", () => {
  it("sorts lines by next arrival and vehicles within each line", () => {
    const result = groupArrivalLines([
      vehicle("2", 300),
      vehicle("10", 40),
      vehicle("2", 60),
      vehicle("10", 120),
    ]);

    expect(result.map(({ lineNumber }) => lineNumber)).toEqual(["10", "2"]);
    expect(
      result.map(({ vehicles }) => vehicles.map((item) => item.secondsLeft)),
    ).toEqual([
      [40, 120],
      [60, 300],
    ]);
  });
});
