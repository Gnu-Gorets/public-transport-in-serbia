const { getHttpClient } = require("../httpClient");

const OSRM_TIMEOUT_MS = 10000;

async function getRoute(coords) {
  const response = await getHttpClient().get(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
    { timeout: OSRM_TIMEOUT_MS },
  );
  return response.data;
}

module.exports = {
  getRoute,
};
