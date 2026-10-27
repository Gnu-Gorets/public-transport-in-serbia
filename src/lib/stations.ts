export type Station = {
  name: string;
  uid: string | number;
  id: string;
  coords: [number, number];
  lines?: string[];
};

export type City = { id: string; name: string };

export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "d")
    .toLocaleLowerCase("sr-Latn");
}

export function searchStations(stations: Station[], query: string): Station[] {
  const folded = foldForSearch(query.trim());
  if (!folded) return [];
  const byId = stations
    .filter((station) => foldForSearch(station.id).startsWith(folded))
    .sort((a, b) => a.id.localeCompare(b.id));
  const idSet = new Set(byId.map((station) => String(station.id)));
  const byName = stations
    .filter(
      (station) =>
        foldForSearch(station.name).includes(folded) &&
        !idSet.has(String(station.id)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "sr-Latn"));
  return [...byId, ...byName];
}

export function distanceMeters(
  from: [number, number],
  to: [number, number],
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [lat1, lon1] = from.map(radians);
  const [lat2, lon2] = to.map(radians);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearbyStations(
  stations: Station[],
  origin: [number, number],
  rangeMeters: number,
): Array<Station & { distance: number }> {
  return stations
    .map((station) => ({
      ...station,
      distance: distanceMeters(origin, station.coords),
    }))
    .filter((station) => station.distance <= rangeMeters)
    .sort((a, b) => a.distance - b.distance);
}
