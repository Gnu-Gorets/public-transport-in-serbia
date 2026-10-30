const { getHttpClient } = require("../httpClient");
const { upstreamError } = require("../errors");

const OSRM_TIMEOUT_MS = 10000;

async function getRoute(coords) {
  try {
    const response = await getHttpClient().get(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { timeout: OSRM_TIMEOUT_MS },
    );
    return response.data;
  } catch {
    throw upstreamError("OSRM request failed");
  }
}

module.exports = {
  getRoute,
};
