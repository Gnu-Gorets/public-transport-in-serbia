import { describe, expect, it } from "vitest";
import {
  searchStations,
  sortStations,
  visibleStations,
  type Station,
} from "./stations.ts";

describe("station search", () => {
  const stations: Station[] = [
    { id: "0536B", uid: "1", name: "Bulevar oslobođenja", coords: [45, 19] },
    { id: "1234", uid: "2", name: "Central station", coords: [45, 19] },
  ];

  it("sorts names without case or diacritic differences, then by numeric ID", () => {
    expect(
      sortStations([
        { id: "10", uid: "10", name: "Zeleznicka", coords: [45, 19] },
        { id: "2", uid: "2", name: "Železnička", coords: [45, 19] },
        { id: "3", uid: "3", name: "Bulevar", coords: [45, 19] },
        { id: "1", uid: "1", name: "bulevar", coords: [45, 19] },
      ]).map(({ id }) => id),
    ).toEqual(["1", "3", "2", "10"]);
  });

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

  it("shows all stations alphabetically until device location is enabled", () => {
    expect(
      visibleStations(stations, false, [45, 19], 100).map(({ id }) => id),
    ).toEqual(["far", "near"]);
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
    ).toEqual(["far", "near"]);
  });
});
