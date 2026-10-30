import { expect, it } from "vitest";
import { validMapCoords } from "../fe/src/lib/components/map/coordinates.ts";

it("accepts numeric and numeric-string map coordinates", () => {
  expect(validMapCoords([45.25, 19.83])).toEqual([45.25, 19.83]);
  expect(validMapCoords(["45.25", "19.83"])).toEqual([45.25, 19.83]);
});

it.each([
  null,
  [null, null],
  ["", "19.83"],
  ["not-a-number", 19.83],
  [91, 19.83],
  [45.25, 181],
  [45.25],
])("rejects invalid map coordinates: %j", (coords) => {
  expect(validMapCoords(coords)).toBeNull();
});
