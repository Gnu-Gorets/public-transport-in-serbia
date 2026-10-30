import { describe, expect, it } from "vitest";
import { foldForSearch, search, sortStations } from "./query.js";
import { normalizeStations } from "./storage.js";

describe("station queries", () => {
  const stations = [
    { city: "ns", id: "1", uid: "1", name: "Železnička" },
    { city: "ns", id: "2", uid: "2", name: "Čaršija" },
    { city: "ns", id: "3", uid: "3", name: "Autobuska" },
  ];

  it("folds Serbian diacritics and searches station names", () => {
    expect(foldForSearch("Železnička")).toBe("zeleznicka");
    expect(search(stations, "carš").map(({ id }) => id)).toEqual(["2"]);
  });

  it("sorts matches by station name", () => {
    expect(sortStations(stations).map(({ name }) => name)).toEqual([
      "Autobuska",
      "Čaršija",
      "Železnička",
    ]);
  });

  it("puts station ID prefixes before name matches", () => {
    const matches = search(
      [
        { city: "ns", id: "20", uid: "a", name: "Line 20" },
        { city: "ns", id: "2", uid: "b", name: "Second" },
        { city: "ns", id: "3", uid: "c", name: "Line 2" },
      ],
      "2",
    );
    expect(matches.map(({ id }) => id)).toEqual(["2", "20", "3"]);
  });

  it("filters nearby stations by exact distance and sorts closest first", async () => {
    const { nearby } = await import("./query.js");
    const matches = nearby(
      [
        { id: "far", lat: 45.01, lon: 19 },
        { id: "near", lat: 45.001, lon: 19 },
        { id: "outside", lat: 45.02, lon: 19 },
      ],
      45,
      19,
      1500,
    );
    expect(matches.map(({ station }) => station.id)).toEqual(["near", "far"]);
  });

  it("normalizes server station rows with the provider key as UID fallback", () => {
    expect(
      normalizeStations("ns", {
        providerUid: { id: 17, name: "Centar", coords: [45, 19] },
      }),
    ).toEqual([
      {
        city: "ns",
        id: "17",
        uid: "providerUid",
        name: "Centar",
        lat: 45,
        lon: 19,
      },
    ]);
  });
});
