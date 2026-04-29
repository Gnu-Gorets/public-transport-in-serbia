const apikeys = require("../apikeys.json");
const crypto = require("../crypto");
const { getHttpClient } = require("../httpClient");
const logger = require("../logger");
const state = require("../state");
const {
  transformAllLinesResponse,
  transformAllStationsResponse,
  transformStationResponse,
} = require("../transforms");
const { badRequest, upstreamError } = require("../errors");

const STATIONS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GET_TIMEOUT_MS = 5000;
const TIMETABLE_TIMEOUT_MS = 10000;
let now = () => Date.now();
const inFlight = {};

function isStationsCacheExpired(city) {
  const cacheMeta = state.getCacheMeta();
  const loadedAt = cacheMeta[city]?.loadedAt;
  return !loadedAt || now() - loadedAt >= STATIONS_CACHE_TTL_MS;
}

function rebuildIdUidMap(city) {
  const idUidMap = state.getIdUidMap();
  const uidIdMap = state.getUidIdMap();
  const allStations = state.getAllStations();

  idUidMap[city] = {};
  uidIdMap[city] = {};
  for (const station of Object.values(allStations[city] || {})) {
    if (station.id != null && station.uid != null) {
      idUidMap[city][String(station.id)] = String(station.uid);
      uidIdMap[city][String(station.uid)] = String(station.id);
    }
  }
}

async function populateMap(force = false) {
  const idUidMap = state.getIdUidMap();

  for (const city of Object.keys(apikeys)) {
    if (!force && idUidMap[city] && !isStationsCacheExpired(city)) {
      continue;
    }

    try {
      await getAllStations(city);
      logger.info(`Populating map finished for ${city}`);
    } catch (err) {
      logger.error({ err }, `Populating map failed for ${city}`);
    }
  }
}

async function getRequest(url, apikey) {
  const headers = {
    "X-Api-Authentication": apikey,
    "User-Agent": "okhttp/4.10.0",
  };

  let response;
  try {
    response = await getHttpClient().get(url, { headers, timeout: GET_TIMEOUT_MS });
  } catch (err) {
    throw upstreamError(err.message || "Provider request failed");
  }
  if (response.status != 200)
    throw upstreamError(`Request failed with status code ${response.status}`);

  return response.data;
}

async function getLineTimetable(city, lineNumber, direction, date) {
  const url = `${apikeys[city].url}/publicapi/v1/timetable/timetable.php`;
  const payload = `action=get_timetable&line_number_for_display=${encodeURIComponent(lineNumber)}&direction_id_for_display=${encodeURIComponent(direction)}&date=${date}&time=`;
  const headers = {
    "X-Api-Authentication": apikeys[city].key,
    "User-Agent": "okhttp/4.10.0",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  let response;
  try {
    response = await getHttpClient().post(url, payload, {
      headers,
      timeout: TIMETABLE_TIMEOUT_MS,
    });
  } catch (err) {
    throw upstreamError(err.message || "Timetable request failed");
  }
  if (response.status !== 200)
    throw upstreamError(`Timetable request failed: ${response.status}`);
  return response.data;
}

async function postRequest(url, apikey, payload) {
  const headers = {
    "X-Api-Authentication": apikey,
    "User-Agent": "okhttp/4.10.0",
  };
  let response;
  try {
    response = await getHttpClient().post(url, payload, {
      headers,
      timeout: GET_TIMEOUT_MS,
    });
  } catch (err) {
    throw upstreamError(err.message || "Provider request failed");
  }
  if (response.status != 200)
    throw upstreamError(`Request failed with status code ${response.status}`);

  return response.data;
}

function getStationUid(city, query) {
  const idUidMap = state.getIdUidMap();

  if (query.uid) return query.uid;
  if (query.id) {
    if (!idUidMap[city])
      throw badRequest(`Map for ${city} is not populated yet`);
    return idUidMap[city][query.id.toString()];
  }
  throw badRequest("Invalid query");
}

async function getStationInfoV1(city, uid) {
  const baseUrl = `${apikeys[city].url}/publicapi/v1/announcement/announcement.php?action=get_announcement_data&station_uid=`;
  let url = baseUrl + uid;
  let resp = await getRequest(url, apikeys[city].key);

  if (resp === "")
    throw upstreamError(`Endpoint returned nothing (perhaps they changed API?)`);
  if (resp[0].success === false)
    throw badRequest(`Endpoint returned error (perhaps invalid ID?)`);

  return transformStationResponse(resp, city);
}

async function getStationInfoV2(city, uid) {
  const allStations = state.getAllStations();
  const uidIdMap = state.getUidIdMap();
  const url = `${apikeys[city].url}/publicapi/v2/api.php`;

  let json = {
    station_uid: uid,
    session_id: `A${Date.now()}`,
  };
  let base = crypto.encrypt(
    JSON.stringify(json),
    apikeys[city].v2_key,
    apikeys[city].v2_iv,
  );
  let payload = `action=data_bulletin&base=${base}`;

  let resp = await postRequest(url, apikeys[city].key, payload);
  if (resp === "")
    throw upstreamError(`Endpoint returned nothing (perhaps they changed API?)`);

  let decoded = JSON.parse(
    crypto.decrypt(resp, apikeys[city].v2_key, apikeys[city].v2_iv),
  );
  if (decoded["success"] == false)
    throw badRequest(`Endpoint returned error (perhaps invalid ID?)`);

  if (!decoded["data"] || decoded["data"].length === 0) {
    const station = allStations[city]?.[uid];
    return {
      city,
      name: station?.name,
      uid: uid,
      id: uidIdMap[city]?.[String(uid)] || "0",
      coords: station?.coords || [0, 0],
      vehicles: [],
    };
  }

  return transformStationResponse(decoded["data"], city);
}

async function getStationInfo(city, query) {
  const uid = getStationUid(city, query);
  if (apikeys[city].api === "v1") return await getStationInfoV1(city, uid);
  else if (apikeys[city].api === "v2") return await getStationInfoV2(city, uid);
  else throw upstreamError("Invalid API version");
}

async function fetchAndCacheStations(city) {
  const allStations = state.getAllStations();
  const allLines = state.getAllLines();
  const url = `${apikeys[city].url}/publicapi/v1/networkextended.php?action=get_cities_extended`;
  const hadCachedStations = Boolean(allStations[city]);

  try {
    const response = await getRequest(url, apikeys[city].key);
    allStations[city] = transformAllStationsResponse(response);
    allLines[city] = transformAllLinesResponse(response);
    rebuildIdUidMap(city);
    state.markCacheLoaded(city, now());
  } catch (err) {
    if (!hadCachedStations) throw err;
    state.markCacheError(city, err);
  }
}

async function getAllStations(city) {
  const allStations = state.getAllStations();

  if (!allStations[city] || isStationsCacheExpired(city)) {
    if (!inFlight[city]) {
      inFlight[city] = fetchAndCacheStations(city).finally(() => {
        delete inFlight[city];
      });
    }
    await inFlight[city];
  }
  return Object.values(allStations[city]);
}

async function getAvailableCities() {
  const allStations = state.getAllStations();

  await populateMap();
  let cities = {};
  for (const id of Object.keys(allStations)) cities[id] = apikeys[id].name;
  return cities;
}

module.exports = {
  getAllStations,
  getAvailableCities,
  getLineTimetable,
  getStationInfo,
  populateMap,
  _test: {
    setNow: (nextNow) => {
      now = nextNow;
    },
    resetNow: () => {
      now = () => Date.now();
    },
    resetInFlight: () => {
      for (const key of Object.keys(inFlight)) delete inFlight[key];
    },
  },
};
