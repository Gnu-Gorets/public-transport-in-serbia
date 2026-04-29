const apikeys = require("../apikeys.json");
const crypto = require("../crypto");
const { getHttpClient } = require("../httpClient");
const state = require("../state");
const {
  getKeyByValue,
  transformAllLinesResponse,
  transformAllStationsResponse,
  transformStationResponse,
} = require("../transforms");

async function populateMap(force = false) {
  const idUidMap = state.getIdUidMap();

  for (const city of Object.keys(apikeys)) {
    if (!force && idUidMap[city]) {
      continue;
    }

    try {
      const stations = await getAllStations(city);

      idUidMap[city] = {};

      for (const station of stations) {
        if (station.id != null && station.uid != null) {
          idUidMap[city][String(station.id)] = String(station.uid);
        }
      }
      console.info(`Populating map finished for ${city}`);
    } catch (err) {
      console.error(`Populating map failed for ${city}`);
      console.error(err);
    }
  }
}

async function getRequest(url, apikey) {
  const headers = {
    "X-Api-Authentication": apikey,
    "User-Agent": "okhttp/4.10.0",
  };

  const response = await getHttpClient().get(url, { headers, timeout: 5000 });
  if (response.status != 200)
    throw new Error(`Request failed with status code ${response.status}`);

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
  const response = await getHttpClient().post(url, payload, {
    headers,
    timeout: 10000,
  });
  if (response.status !== 200)
    throw new Error(`Timetable request failed: ${response.status}`);
  return response.data;
}

async function postRequest(url, apikey, payload) {
  const headers = {
    "X-Api-Authentication": apikey,
    "User-Agent": "okhttp/4.10.0",
  };
  const response = await getHttpClient().post(url, payload, {
    headers,
    timeout: 5000,
  });
  if (response.status != 200)
    throw new Error(`Request failed with status code ${response.status}`);

  return response.data;
}

function getStationUid(city, query) {
  const idUidMap = state.getIdUidMap();

  if (query.uid) return query.uid;
  if (query.id) {
    if (!idUidMap[city]) throw new Error(`Map for ${city} is not populated yet`);
    return idUidMap[city][query.id.toString()];
  }
  throw new Error("Invalid query");
}

async function getStationInfoV1(city, uid) {
  const baseUrl = `${apikeys[city].url}/publicapi/v1/announcement/announcement.php?action=get_announcement_data&station_uid=`;
  let url = baseUrl + uid;
  let resp = await getRequest(url, apikeys[city].key);

  if (resp === "")
    throw new Error(`Endpoint returned nothing (perhaps they changed API?)`);
  if (resp[0].success === false)
    throw new Error(`Endpoint returned error (perhaps invalid ID?)`);

  return transformStationResponse(resp, city);
}

async function getStationInfoV2(city, uid) {
  const allStations = state.getAllStations();
  const idUidMap = state.getIdUidMap();
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
    throw new Error(`Endpoint returned nothing (perhaps they changed API?)`);

  let decoded = JSON.parse(
    crypto.decrypt(resp, apikeys[city].v2_key, apikeys[city].v2_iv),
  );
  if (decoded["success"] == false)
    throw new Error(`Endpoint returned error (perhaps invalid ID?)`);

  if (!decoded["data"] || decoded["data"].length === 0) {
    const station = allStations[city]?.[uid];
    return {
      city,
      name: station?.name,
      uid: uid,
      id: getKeyByValue(idUidMap[city], String(uid)) || "0",
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
  else throw new Error("Invalid API version");
}

async function getAllStations(city) {
  const allStations = state.getAllStations();
  const allLines = state.getAllLines();
  const url = `${apikeys[city].url}/publicapi/v1/networkextended.php?action=get_cities_extended`;
  if (!allStations[city]) {
    const response = await getRequest(url, apikeys[city].key);
    allStations[city] = transformAllStationsResponse(response);
    allLines[city] = transformAllLinesResponse(response);
  }
  return Object.values(allStations[city]);
}

async function getAvailableCities() {
  const allStations = state.getAllStations();

  await populateMap();
  let cities = new Object();
  for (const id of Object.keys(allStations)) cities[id] = apikeys[id].name;
  return cities;
}

module.exports = {
  getAllStations,
  getAvailableCities,
  getLineTimetable,
  getStationInfo,
  populateMap,
};
