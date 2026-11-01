export type RoutePoint = [number, number];
export type RouteSegments = RoutePoint[][];

function validLatLon(point: unknown): point is RoutePoint {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 90 &&
    Math.abs(point[1]) <= 180
  );
}

export function vehicleRouteSegments(
  stations: Array<{ latitude: number; longitude: number }>,
): RouteSegments {
  const points = stations
    .map(({ latitude, longitude }) => [latitude, longitude])
    .filter(validLatLon);
  return points.length > 1 ? [points] : [];
}

export function geoJsonRouteSegments(geometry: unknown): RouteSegments {
  if (!geometry || typeof geometry !== "object" || !("coordinates" in geometry))
    return [];
  const value = geometry as {
    type?: unknown;
    coordinates?: unknown;
  };
  const source =
    value.type === "LineString"
      ? [value.coordinates]
      : value.type === "MultiLineString"
        ? value.coordinates
        : [];
  if (!Array.isArray(source)) return [];

  return source.flatMap((segment) => {
    if (!Array.isArray(segment)) return [];
    const points = segment
      .map((point) => (Array.isArray(point) ? [point[1], point[0]] : undefined))
      .filter(validLatLon);
    return points.length > 1 ? [points] : [];
  });
}
