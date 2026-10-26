const data = require("../data/yandex-belgrade-bus-stops.json");

function validateStops(value) {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.updatedAt) ||
    !Array.isArray(value.stops)
  ) {
    throw new Error("Belgrade stop catalog is invalid");
  }
  const ids = new Set();
  for (const stop of value.stops) {
    if (
      !stop ||
      typeof stop.id !== "string" ||
      !/^\d{1,20}$/.test(stop.id) ||
      ids.has(stop.id) ||
      typeof stop.name !== "string" ||
      !stop.name.trim() ||
      !Array.isArray(stop.coords) ||
      stop.coords.length !== 2 ||
      !stop.coords.every(Number.isFinite) ||
      stop.coords[0] < 44.35 ||
      stop.coords[0] > 45.1 ||
      stop.coords[1] < 20.1 ||
      stop.coords[1] > 20.8
    ) {
      throw new Error("Belgrade stop catalog contains invalid stop");
    }
    ids.add(stop.id);
  }
  return value;
}

module.exports = { belgradeStops: validateStops(data), validateStops };
