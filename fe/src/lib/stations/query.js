export function foldForSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (letter) => (letter === "Đ" ? "D" : "d"))
    .toLocaleLowerCase("sr-Latn");
}

export function sortStations(stations) {
  return [...stations].sort((a, b) =>
    a.name.localeCompare(b.name, "sr-Latn", { sensitivity: "base" }),
  );
}

export function search(stations, query) {
  const term = foldForSearch(query).trim();
  if (!term) return [];

  const byId = stations
    .filter((station) => foldForSearch(station.id).startsWith(term))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const seenIds = new Set(byId.map(({ city, id }) => `${city}:${id}`));
  const byName = stations
    .filter((station) => {
      const key = `${station.city}:${station.id}`;
      return foldForSearch(station.name).includes(term) && !seenIds.has(key);
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, "sr-Latn", { sensitivity: "base" }),
    );
  return [...byId, ...byName];
}

export function boundingBoxForRange(latitude, longitude, rangeMeters) {
  const latitudeDelta = rangeMeters / 111_320;
  const longitudeDelta =
    rangeMeters / (111_320 * Math.cos((latitude * Math.PI) / 180));
  return {
    south: latitude - latitudeDelta,
    west: longitude - longitudeDelta,
    north: latitude + latitudeDelta,
    east: longitude + longitudeDelta,
  };
}

export function inViewport(stations, bounds, limit = 500) {
  const visible = stations.filter(
    ({ lat, lon }) =>
      lat >= bounds.south &&
      lat <= bounds.north &&
      lon >= bounds.west &&
      lon <= bounds.east,
  );
  if (visible.length <= limit) return visible;
  const scatter = (station) =>
    (Math.abs(station.lat * station.lon * 1_000_000) % 7919) / 7919;
  return visible.sort((a, b) => scatter(a) - scatter(b)).slice(0, limit);
}

function distanceMeters(latitude, longitude, station) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = radians(latitude);
  const lat2 = radians(station.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(station.lon - longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearby(stations, latitude, longitude, rangeMeters) {
  const bounds = boundingBoxForRange(latitude, longitude, rangeMeters);
  return inViewport(stations, bounds, Infinity)
    .map((station) => ({
      station,
      distance: distanceMeters(latitude, longitude, station),
    }))
    .filter(({ distance }) => distance <= rangeMeters)
    .sort((a, b) => a.distance - b.distance);
}
