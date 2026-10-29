export function validMapCoords(coords: unknown): [number, number] | null {
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    coords.some(
      (value) =>
        !["number", "string"].includes(typeof value) ||
        (typeof value === "string" && value.trim() === ""),
    )
  )
    return null;

  const [latitude, longitude] = coords.map(Number);
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? [latitude, longitude]
    : null;
}
