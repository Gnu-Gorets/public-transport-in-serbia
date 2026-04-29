const { getHttpClient } = require("../httpClient");

async function getRoute(coords) {
  const response = await getHttpClient().get(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
    { timeout: 10000 },
  );
  return response.data;
}

module.exports = {
  getRoute,
};
