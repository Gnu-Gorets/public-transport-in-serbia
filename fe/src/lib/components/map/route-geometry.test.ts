import { describe, expect, it } from "vitest";
import {
  geoJsonRouteSegments,
  vehicleRouteSegments,
} from "./route-geometry.ts";

describe("route geometry", () => {
  it("converts vehicle stop coordinates from latitude/longitude", () => {
    expect(
      vehicleRouteSegments([
        { latitude: 44.8, longitude: 20.4 },
        { latitude: 44.9, longitude: 20.5 },
      ]),
    ).toEqual([
      [
        [44.8, 20.4],
        [44.9, 20.5],
      ],
    ]);
  });

  it("converts GeoJSON longitude/latitude and ignores invalid segments", () => {
    expect(
      geoJsonRouteSegments({
        type: "MultiLineString",
        coordinates: [
          [
            [20.4, 44.8],
            [20.5, 44.9],
          ],
          [[200, 95]],
        ],
      }),
    ).toEqual([
      [
        [44.8, 20.4],
        [44.9, 20.5],
      ],
    ]);
  });
});
