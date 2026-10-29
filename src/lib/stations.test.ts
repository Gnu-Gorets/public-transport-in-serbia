import { describe, expect, it } from "vitest";
import { searchStations, visibleStations, type Station } from "./stations.ts";

describe("station search", () => {
  const stations: Station[] = [
    { id: "0536B", uid: "1", name: "Bulevar oslobođenja", coords: [45, 19] },
    { id: "1234", uid: "2", name: "Central station", coords: [45, 19] },
  ];

  it("matches favorite stations by name and ID", () => {
    expect(searchStations(stations, "oslobo").map(({ id }) => id)).toEqual([
      "0536B",
    ]);
    expect(searchStations(stations, "123").map(({ id }) => id)).toEqual([
      "1234",
    ]);
    expect(searchStations(stations, "missing")).toEqual([]);
  });
});

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

  it("restores the full station list when leaving nearby mode", () => {
    const location = [45, 19] as [number, number];
    expect(visibleStations(stations, true, location, 100)).toHaveLength(1);
    expect(
      visibleStations(stations, false, location, 100).map(({ id }) => id),
    ).toEqual(["near", "far"]);
  });
});
