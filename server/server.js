const fastify = require("fastify")({
  logger: true,
});
const axios = require("axios");
const path = require("path");

const crypto = require("./crypto");

fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "../static"),
  prefix: "/static/",
});
fastify.register(require("@fastify/cors"), {
  origin: "*",
  methods: "*",
  allowedHeaders: "*",
});

const apikeys = require("./apikeys.json");

let id_uid_map = {};
let allStations = {};
let allLines = {};

const getKeyByValue = (object, value) => {
  return Object.keys(object).find((key) => object[key] === value);
};
function transformAllStationsResponse(response) {
  let newResp = {};
  response.stations.forEach((value) => {
    let station = new Object();
    station.name = value.name;
    station.uid = value.id;
    station.id = value.station_id;
    station.coords = [value.coordinates.latitude, value.coordinates.longitude];
    station.lines = value.lines_for_station || [];
    newResp[station.uid] = station;
  });
  return newResp;
}

function transformAllLinesResponse(response) {
  const result = {};
  (response.lines || []).forEach((line) => {
    const key = `${line.line_number_for_display}_${line.direction_id_for_display}`;
    result[key] = line.all_stations;
  });
  return result;
}

function transformStationResponse(response, city) {
  let newResp = new Object();
  newResp.city = city;
  newResp.name = response[0].station_name;
  newResp.uid = response[0].station_uid;
  newResp.id =
    getKeyByValue(id_uid_map[city], response[0].station_uid.toString()) || "0";
  newResp.coords = allStations[city][newResp.uid].coords;
  newResp.vehicles = new Array();

  if (response[0].just_coordinates == "1") return newResp;

  response.map((value) => {
    let vehicle = new Object();
    vehicle.lineNumber = value.line_number;
    vehicle.lineName = value.line_title;
    vehicle.secondsLeft = value.seconds_left;
    vehicle.stationsBetween = value.stations_between;
    vehicle.main_line_title = value.main_line_title;
    vehicle.stationName = value.vehicles[0].station_name;
    vehicle.garageNo = value.vehicles[0].garageNo;
    vehicle.coords = [value.vehicles[0].lat, value.vehicles[0].lng];
    vehicle.allStations = value.all_stations.map((station) => ({
      latitude: station.coordinates.latitude,
      longitude: station.coordinates.longitude,
    }));
    newResp.vehicles.push(vehicle);
  });

  return newResp;
}

async function populateMap(force = false) {
  for (const city of Object.keys(apikeys)) {
    if (!force && id_uid_map[city]) {
      continue;
    }

    try {
      const stations = await getAllStations(city);

      id_uid_map[city] = {};

      for (const station of stations) {
        id_uid_map[city][station.id.toString()] = station.uid.toString();
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

  const response = await axios.get(url, { headers, timeout: 5000 });
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
  const response = await axios.post(url, payload, { headers, timeout: 10000 });
  if (response.status !== 200)
    throw new Error(`Timetable request failed: ${response.status}`);
  return response.data;
}

async function postRequest(url, apikey, payload) {
  const headers = {
    "X-Api-Authentication": apikey,
    "User-Agent": "okhttp/4.10.0",
  };
  const response = await axios.post(url, payload, { headers, timeout: 5000 });
  if (response.status != 200)
    throw new Error(`Request failed with status code ${response.status}`);

  return response.data;
}

function getStationUid(city, query) {
  if (query.uid) return query.uid;
  if (query.id) {
    if (!id_uid_map[city])
      throw new Error(`Map for ${city} is not populated yet`);
    return id_uid_map[city][query.id.toString()];
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

  return transformStationResponse(decoded["data"], city);
}

async function getStationInfo(city, query) {
  const uid = getStationUid(city, query);
  if (apikeys[city].api === "v1") return await getStationInfoV1(city, uid);
  else if (apikeys[city].api === "v2") return await getStationInfoV2(city, uid);
  else throw new Error("Invalid API version");
}

async function getAllStations(city) {
  const url = `${apikeys[city].url}/publicapi/v1/networkextended.php?action=get_cities_extended`;
  if (!allStations[city]) {
    const response = await getRequest(url, apikeys[city].key);
    allStations[city] = transformAllStationsResponse(response);
    allLines[city] = transformAllLinesResponse(response);
  }
  return Object.values(allStations[city]);
}

async function getAvailableCities() {
  await populateMap();
  let cities = new Object();
  for (const id of Object.keys(allStations)) cities[id] = apikeys[id].name;
  return cities;
}

fastify.get("/api/stations/:city/search", async (request, reply) => {
  const city = request.params.city;
  try {
    const response = await getStationInfo(city, request.query);
    reply.send(response);
  } catch (err) {
    console.error(err);
    reply.send(err);
  }
});
fastify.get("/api/stations/:city/all", async (request, reply) => {
  const city = request.params.city;
  try {
    const response = await getAllStations(city);
    reply.send(response);
  } catch (err) {
    console.error(err);
    reply.send(err);
  }
});
fastify.get("/api/lines/:city", async (request, reply) => {
  const city = request.params.city;
  try {
    if (!allLines[city]) await getAllStations(city);
    reply.send(allLines[city] || {});
  } catch (err) {
    console.error(err);
    reply.send(err);
  }
});
fastify.get("/api/cities", async (request, reply) => {
  try {
    const response = await getAvailableCities();
    reply.send(response);
  } catch (err) {
    console.error(err);
    reply.send(err);
  }
});
fastify.get("/api/stations/:city/schedule", async (request, reply) => {
  const city = request.params.city;
  const { uid, date } = request.query;

  if (!uid) return reply.status(400).send({ error: "uid is required" });

  const scheduleDate = (() => {
    if (date) return date;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Belgrade" }));
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  try {
    if (!allStations[city]) await getAllStations(city);
    const station = allStations[city]?.[uid];
    if (!station) return reply.status(404).send({ error: "Station not found" });

    const lines = station.lines || [];
    const schedule = {};
    const nowHHMM = new Date().toLocaleTimeString("en-GB", {
      timeZone: "Europe/Belgrade",
      hour: "2-digit",
      minute: "2-digit",
    });

    await Promise.all(
      lines.flatMap((line) =>
        ["A", "B"].map(async (direction) => {
          try {
            const timetable = await getLineTimetable(
              city,
              line,
              direction,
              scheduleDate,
            );
            if (!Array.isArray(timetable)) return;
            const stationEntry = timetable.find(
              (s) => String(s.station_id) === String(uid),
            );
            if (!stationEntry?.departure_time?.length) return;

            const times = stationEntry.departure_time.filter((t) => {
              if (t.includes("(+24h)")) return true;
              return t.trim() >= nowHHMM;
            });
            if (!times.length) return;

            if (!schedule[line]) schedule[line] = new Set();
            times.forEach((t) => schedule[line].add(t));
          } catch (_) {
            /* skip */
          }
        }),
      ),
    );

    const result = {};
    for (const line of Object.keys(schedule).sort()) {
      result[line] = [...schedule[line]].sort((a, b) => {
        const aIs24 = a.includes("(+24h)");
        const bIs24 = b.includes("(+24h)");
        if (aIs24 !== bIs24) return aIs24 ? 1 : -1;
        return a.replace("(+24h)", "").trim().localeCompare(b.replace("(+24h)", "").trim());
      });
    }

    reply.send({
      station: { uid: station.uid, name: station.name, id: station.id },
      schedule: result,
      date: scheduleDate,
    });
  } catch (err) {
    console.error(err);
    reply.status(500).send({ error: "Failed to fetch schedule" });
  }
});
fastify.get("/api/route", async (request, reply) => {
  const { coords } = request.query;
  try {
    const response = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { timeout: 10000 },
    );
    reply.send(response.data);
  } catch (err) {
    console.error(err);
    reply.status(502).send({ error: "OSRM request failed" });
  }
});
fastify.get("/", (request, reply) => reply.sendFile("index.html"));

(async () => {
  try {
    await populateMap(true);
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
