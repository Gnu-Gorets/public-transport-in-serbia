const apikeys = require("../config");
const crypto = require("../crypto");
const { getHttpClient } = require("../httpClient");
const logger = require("../logger");
const { state, markCacheLoaded, markCacheError } = require("../state");
const {
  transformAllLinesResponse,
  transformAllStationsResponse,
  transformStationResponse,
} = require("../transforms");
const { badRequest, upstreamError } = require("../errors");

const STATIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STATIONS_CACHE_STALE_MS = 7 * STATIONS_CACHE_TTL_MS;
const GET_TIMEOUT_MS = 5000;
const TIMETABLE_TIMEOUT_MS = 10000;
let now = () => Date.now();
const inFlight = {};

function isStationsCacheExpired(city) {
  const loadedAt = state.cacheMeta[city]?.loadedAt;
  return !loadedAt || now() - loadedAt >= STATIONS_CACHE_TTL_MS;
}

function rebuildIdUidMap(city) {
  state.idUidMap[city] = {};
  state.uidIdMap[city] = {};
  for (const station of Object.values(state.allStations[city] || {})) {
    if (station.id != null && station.uid != null) {
      state.idUidMap[city][String(station.id)] = String(station.uid);
      state.uidIdMap[city][String(station.uid)] = String(station.id);
    }
  }
}

async function populateMap(force = false) {
  for (const city of Object.keys(apikeys)) {
    if (!force && state.idUidMap[city] && !isStationsCacheExpired(city)) continue;
    try {
      await getAllStations(city);
      logger.info(`Populating map finished for ${city}`);
    } catch (err) {
      logger.error({ err }, `Populating map failed for ${city}`);
    }
  }
}

async function request(method, url, apikey, { payload, timeout = GET_TIMEOUT_MS, contentType } = {}) {
  const headers = { "X-Api-Authentication": apikey, "User-Agent": "okhttp/4.10.0" };
  if (payload) headers["Content-Type"] = contentType || "application/x-www-form-urlencoded";
  try {
    const response = payload
      ? await getHttpClient()[method](url, payload, { headers, timeout })
      : await getHttpClient()[method](url, { headers, timeout });
    if (response.status !== 200)
      throw new Error(`Request failed with status code ${response.status}`);
    return response.data;
  } catch (err) {
    throw upstreamError(err.message || "Provider request failed");
  }
}

async function getLineTimetable(city, lineNumber, direction, date) {
  const url = `${apikeys[city].url}/publicapi/v1/timetable/timetable.php`;
  const payload = `action=get_timetable&line_number_for_display=${encodeURIComponent(lineNumber)}&direction_id_for_display=${encodeURIComponent(direction)}&date=${date}&time=`;
  return request("post", url, apikeys[city].key, { payload, timeout: TIMETABLE_TIMEOUT_MS });
}

function getStationUid(city, query) {
  if (query.uid) return query.uid;
  if (query.id) {
    if (!state.idUidMap[city]) throw badRequest(`Map for ${city} is not populated yet`);
    return state.idUidMap[city][query.id.toString()];
  }
  throw badRequest("Invalid query");
}

async function getStationInfoV1(city, uid) {
  const url = `${apikeys[city].url}/publicapi/v1/announcement/announcement.php?action=get_announcement_data&station_uid=${uid}`;
  const resp = await request("get", url, apikeys[city].key);
  if (resp === "") throw upstreamError(`Endpoint returned nothing (perhaps they changed API?)`);
  if (resp[0].success === false) throw badRequest(`Endpoint returned error (perhaps invalid ID?)`);
  return transformStationResponse(resp, city);
}

async function getStationInfoV2(city, uid) {
  const url = `${apikeys[city].url}/publicapi/v2/api.php`;
  const base = crypto.encrypt(
    JSON.stringify({ station_uid: uid, session_id: `A${Date.now()}` }),
    apikeys[city].v2_key,
    apikeys[city].v2_iv,
  );
  const resp = await request("post", url, apikeys[city].key, { payload: `action=data_bulletin&base=${base}` });
  if (resp === "") throw upstreamError(`Endpoint returned nothing (perhaps they changed API?)`);
  const decoded = JSON.parse(crypto.decrypt(resp, apikeys[city].v2_key, apikeys[city].v2_iv));
  if (decoded["success"] == false) throw badRequest(`Endpoint returned error (perhaps invalid ID?)`);
  if (!decoded["data"] || decoded["data"].length === 0) {
    const station = state.allStations[city]?.[uid];
    return {
      city,
      name: station?.name,
      uid,
      id: state.uidIdMap[city]?.[String(uid)] || "0",
      coords: station?.coords || [0, 0],
      vehicles: [],
    };
  }
  return transformStationResponse(decoded["data"], city);
}

async function getStationInfo(city, query) {
  const uid = getStationUid(city, query);
  if (apikeys[city].api === "v1") return getStationInfoV1(city, uid);
  if (apikeys[city].api === "v2") return getStationInfoV2(city, uid);
  throw upstreamError("Invalid API version");
}

async function fetchAndCacheStations(city) {
  const url = `${apikeys[city].url}/publicapi/v1/networkextended.php`;
  const hadCachedStations = Boolean(state.allStations[city]);
  try {
    const response = await request("post", url, apikeys[city].key, {
      payload: JSON.stringify({ action: "get_cities_extended" }),
      contentType: "application/json",
    });
    state.allStations[city] = transformAllStationsResponse(response);
    state.allLines[city] = transformAllLinesResponse(response);
    rebuildIdUidMap(city);
    markCacheLoaded(city, now());
  } catch (err) {
    const age = now() - (state.cacheMeta[city]?.loadedAt || 0);
    if (!hadCachedStations || age >= STATIONS_CACHE_TTL_MS + STATIONS_CACHE_STALE_MS) throw err;
    markCacheError(city, err);
    logger.warn({ err }, `Station cache refresh failed for ${city}; serving stale data`);
  }
}

async function getAllStations(city) {
  if (!state.allStations[city] || isStationsCacheExpired(city)) {
    if (!inFlight[city]) {
      inFlight[city] = fetchAndCacheStations(city).finally(() => { delete inFlight[city]; });
    }
    const refresh = inFlight[city];
    const age = now() - (state.cacheMeta[city]?.loadedAt || 0);
    if (state.allStations[city] && age < STATIONS_CACHE_TTL_MS + STATIONS_CACHE_STALE_MS) {
      refresh.catch((err) => logger.error({ err }, `Refreshing stations failed for ${city}`));
    } else {
      await refresh;
    }
  }
  return Object.values(state.allStations[city]);
}

async function getAvailableCities() {
  await populateMap();
  return Object.fromEntries(Object.keys(state.allStations).map((id) => [id, apikeys[id].name]));
}

module.exports = {
  getAllStations,
  getAvailableCities,
  getLineTimetable,
  getStationInfo,
  populateMap,
  _test: {
    setNow: (nextNow) => { now = nextNow; },
    resetNow: () => { now = () => Date.now(); },
    resetInFlight: () => { for (const key of Object.keys(inFlight)) delete inFlight[key]; },
  },
};
