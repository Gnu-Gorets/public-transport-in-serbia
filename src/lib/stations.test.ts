import { describe, expect, it } from "vitest";
import { visibleStations, type Station } from "./stations.ts";

describe("visible stations", () => {
  const stations: Station[] = [
    { id: "near", uid: "near", name: "Nearby", coords: [45, 19] },
    { id: "far", uid: "far", name: "Far away", coords: [45.01, 19] },
  ];

  it("shows all stations until device location is explicitly enabled", () => {
    expect(
      visibleStations(stations, false, [45, 19], 100).map(({ id }) => id),
    ).toEqual(["near", "far"]);
  });

  it("filters stations by range after device location is enabled", () => {
    expect(
      visibleStations(stations, true, [45, 19], 100).map(({ id }) => id),
    ).toEqual(["near"]);
  });
});
