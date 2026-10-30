const { getHttpClient } = require("../httpClient");
const { upstreamError } = require("../errors");
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

const belgradeStops = validateStops(data);
const knownStopIds = new Set(belgradeStops.stops.map(({ id }) => id));

const STOP_CACHE_TTL_MS = 30_000;
const stopCache = new Map();
const stopInFlight = new Map();
const STOP_PAGE_TIMEOUT_MS = 5000;
const MAX_STOP_PAGE_BYTES = 1_000_000;
const upstreamCookies = new Map();
const routeCache = new Map();
const SERBIAN_CYRILLIC = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Ђ: "Đ",
  Е: "E",
  Ж: "Ž",
  З: "Z",
  И: "I",
  Ј: "J",
  К: "K",
  Л: "L",
  Љ: "Lj",
  М: "M",
  Н: "N",
  Њ: "Nj",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  Ћ: "Ć",
  У: "U",
  Ф: "F",
  Х: "H",
  Ц: "C",
  Ч: "Č",
  Џ: "Dž",
  Ш: "Š",
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  ђ: "đ",
  е: "e",
  ж: "ž",
  з: "z",
  и: "i",
  ј: "j",
  к: "k",
  л: "l",
  љ: "lj",
  м: "m",
  н: "n",
  њ: "nj",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  ћ: "ć",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "č",
  џ: "dž",
  ш: "š",
};

function toLatin(text) {
  if (typeof text !== "string") return text;
  return text.replace(
    /[А-Яа-яЂђЈјЉљЊњЋћЏџ]/g,
    (letter) => SERBIAN_CYRILLIC[letter] || letter,
  );
}

function toIsoTime(value) {
  const timestamp = Number(value);
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    timestamp > 8_640_000_000_000
  )
    return null;
  return new Date(timestamp * 1000).toISOString();
}

function parsePageState(html) {
  const stateScript = html.match(
    /<script\b(?=[^>]*\btype=["']application\/json["'])(?=[^>]*\bclass=["'][^"']*\bstate-view\b[^"']*["'])[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!stateScript) throw upstreamError("Yandex stop page state not found");

  let pageState;
  try {
    pageState = JSON.parse(stateScript[1]);
  } catch {
    throw upstreamError("Yandex stop page state is invalid");
  }

  if (!pageState?.config || typeof pageState.config !== "object") {
    throw upstreamError("Yandex page state is invalid");
  }
  return pageState;
}

function parseStopPage(html, stopId) {
  const pageState = parsePageState(html);
  const stop = pageState.config?.masstransitStop;
  const invalidFields = [];
  if (!stop) invalidFields.push("stop=missing");
  else {
    if (String(stop.id) !== stopId) invalidFields.push("id=mismatch");
    if (typeof stop.name !== "string") invalidFields.push("name=invalid_type");
    if (!Array.isArray(stop.coordinates)) {
      invalidFields.push("coordinates=invalid_type");
    } else {
      if (stop.coordinates.length !== 2)
        invalidFields.push("coordinates=invalid_length");
      if (!stop.coordinates.every(Number.isFinite))
        invalidFields.push("coordinates=non_finite_values");
    }
    if (!Array.isArray(stop.transports))
      invalidFields.push("transports=invalid_type");
  }
  if (invalidFields.length) {
    throw upstreamError(
      `Yandex stop data is invalid (${invalidFields.join(", ")})`,
    );
  }

  const arrivals = stop.transports.flatMap((transport) =>
    (transport?.threads || []).flatMap((thread) =>
      (thread?.BriefSchedule?.Events || []).flatMap((event) => {
        const scheduledAt = toIsoTime(event?.Scheduled?.value);
        const estimatedAt = toIsoTime(event?.Estimated?.value);
        if (!scheduledAt && !estimatedAt) return [];
        const destination = thread.EssentialStops?.at(-1)?.name;

        return [
          {
            lineNumber: String(transport.name),
            transportType: transport.type || null,
            destination: destination ? toLatin(destination) : null,
            scheduledAt,
            estimatedAt,
            vehicleId: event.vehicleId || null,
            isEstimated: Boolean(estimatedAt),
            route: routeReference(transport, thread),
          },
        ];
      }),
    ),
  );

  return {
    city: "bg",
    name: toLatin(stop.name),
    uid: String(stopId),
    id: String(stopId),
    coords: [stop.coordinates[1], stop.coordinates[0]],
    arrivals,
  };
}

function routeReference(transport, thread) {
  if (
    !/^\d+$/.test(transport.lineId) ||
    !/^\d+$/.test(thread.threadId) ||
    !["bus", "trolleybus", "tram", "tramway", "minibus"].includes(
      transport.type,
    ) ||
    typeof transport.uri !== "string" ||
    !transport.uri.startsWith("ymapsbm1://transit/line?") ||
    typeof transport.seoname !== "string" ||
    !/^[\w-]+$/.test(transport.seoname)
  )
    return null;
  let uri;
  try {
    uri = new URL(transport.uri);
  } catch {
    return null;
  }
  if (uri.searchParams.get("id") !== transport.lineId) return null;
  return {
    lineId: transport.lineId,
    threadId: thread.threadId,
    path: `/maps/10522/belgrade/routes/${transport.type}_${transport.seoname}/${Buffer.from(transport.uri).toString("hex")}/`,
  };
}

function validCoordinates(coords) {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    coords.every(Number.isFinite) &&
    Math.abs(coords[0]) <= 180 &&
    Math.abs(coords[1]) <= 90
  );
}

function parseRoutePage(
  html,
  lineId,
  threadId,
  pageState = parsePageState(html),
) {
  const line = pageState.config?.masstransitLine;
  const thread =
    Array.isArray(line?.features) &&
    line.features.find(
      (item) =>
        item?.properties?.ThreadMetaData?.id === threadId &&
        item.properties.ThreadMetaData.lineId === lineId,
    );
  if (
    !thread ||
    !Array.isArray(thread.features) ||
    typeof thread.properties.ThreadMetaData.name !== "string"
  ) {
    throw upstreamError("Yandex route direction not found");
  }
  const stops = [];
  const segments = [];
  for (const feature of thread.features) {
    if (!feature || typeof feature !== "object")
      throw upstreamError("Yandex route feature is invalid");
    if (feature.points !== undefined) {
      if (
        !Array.isArray(feature.points) ||
        !feature.points.every(validCoordinates)
      ) {
        throw upstreamError("Yandex route geometry is invalid");
      }
      segments.push(feature.points.map(([lon, lat]) => [lat, lon]));
    } else if (feature.id !== undefined) {
      if (
        typeof feature.name !== "string" ||
        !validCoordinates(feature.coordinates)
      ) {
        throw upstreamError("Yandex route stop is invalid");
      }
      stops.push({
        id: String(feature.id),
        name: toLatin(feature.name),
        coords: [feature.coordinates[1], feature.coordinates[0]],
      });
    }
  }
  if (stops.length < 2 || !segments.some((segment) => segment.length >= 2)) {
    throw upstreamError("Yandex route data is incomplete");
  }
  return {
    lineId,
    threadId,
    name: String(thread.properties.ThreadMetaData.name),
    type: thread.properties.ThreadMetaData.type,
    stops,
    segments,
  };
}

function parseVehiclePositions(data, lineId) {
  if (!Array.isArray(data?.vehicles))
    throw upstreamError("Yandex vehicle data is invalid");
  return data.vehicles.flatMap((vehicle) => {
    const metadata = vehicle?.properties?.VehicleMetaData;
    const coords = vehicle?.features?.[0]?.geometry?.coordinates?.[0];
    if (
      metadata?.Transport?.lineId !== lineId ||
      typeof metadata.id !== "string" ||
      typeof metadata.Transport.name !== "string" ||
      !validCoordinates(coords)
    )
      return [];
    return [
      {
        id: metadata.id,
        lineNumber: metadata.Transport.name,
        coords: [coords[1], coords[0]],
      },
    ];
  });
}

function queryString(params) {
  return Object.keys(params)
    .sort((a, b) =>
      a.toLowerCase() < b.toLowerCase()
        ? -1
        : a.toLowerCase() > b.toLowerCase()
          ? 1
          : 0,
    )
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(params[key]).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    )
    .join("&");
}

function querySignature(params) {
  const value = queryString(params);
  let hash = 5381;
  for (let i = 0; i < value.length; i++)
    hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  return String(hash);
}

function routeViewport(route) {
  // Route shape sets query viewport only; vehicle coordinates come from live feed.
  const points = route.segments.flat();
  const latitudes = points.map(([lat]) => lat);
  const longitudes = points.map(([, lon]) => lon);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  return {
    ll: `${(minLon + maxLon) / 2},${(minLat + maxLat) / 2}`,
    spn: `${Math.max(maxLon - minLon, 0.01)},${Math.max(maxLat - minLat, 0.01)}`,
  };
}

function yandexHeaders() {
  return {
    "User-Agent": "SerbiaTransport/1.0",
    ...(upstreamCookies.size
      ? {
          Cookie: [...upstreamCookies]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
        }
      : {}),
  };
}

function mergeCookies(setCookie = []) {
  for (const cookie of Array.isArray(setCookie) ? setCookie : [setCookie]) {
    const pair = cookie?.split(";", 1)[0];
    const separator = pair?.indexOf("=");
    if (separator > 0)
      upstreamCookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function fetchVehiclePositions(route, config, pageUrl) {
  const params = {
    ajax: "1",
    csrfToken: config.csrfToken,
    sessionId: config.counters?.analytics?.sessionId,
    locale: config.realLocale,
    lang: config.lang,
    lineId: route.lineId,
    type: route.type,
    ...routeViewport(route),
  };
  if (
    Object.values(params).some((value) => typeof value !== "string" || !value)
  ) {
    throw upstreamError("Yandex vehicle request context is invalid");
  }
  const request = async () => {
    const query = { ...params, s: querySignature(params) };
    const url = new URL(
      "https://yandex.com/maps/api/masstransit/getVehiclesInfoWithRegion",
    );
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    let response;
    try {
      response = await getHttpClient().get(url.href, {
        timeout: STOP_PAGE_TIMEOUT_MS,
        maxContentLength: MAX_STOP_PAGE_BYTES,
        responseType: "json",
        headers: {
          ...yandexHeaders(),
          Accept: "application/json",
          "X-Retpath-Y": pageUrl,
        },
      });
    } catch (err) {
      throw upstreamError(err.message || "Yandex vehicle request failed");
    }
    mergeCookies(response.headers?.["set-cookie"]);
    if (
      response.status !== 200 ||
      !response.data ||
      typeof response.data !== "object"
    ) {
      throw upstreamError("Yandex vehicle response is invalid");
    }
    return response.data;
  };
  let data = await request();
  if (data.csrfToken && !data.data) {
    params.csrfToken = data.csrfToken;
    config.csrfToken = data.csrfToken;
    data = await request();
  }
  if (!data.data || typeof data.data !== "object")
    throw upstreamError("Yandex vehicle response is incomplete");
  return parseVehiclePositions(data.data, route.lineId);
}

async function fetchPage(url) {
  let response;
  try {
    response = await getHttpClient().get(url, {
      timeout: STOP_PAGE_TIMEOUT_MS,
      maxContentLength: MAX_STOP_PAGE_BYTES,
      responseType: "text",
      headers: { ...yandexHeaders(), Accept: "text/html" },
    });
  } catch (err) {
    throw upstreamError(err.message || "Yandex page request failed");
  }

  mergeCookies(response.headers?.["set-cookie"]);
  if (response.status !== 200 || typeof response.data !== "string") {
    throw upstreamError("Yandex page returned invalid response");
  }
  return response.data;
}

async function getRoutePage(lineId, threadId, stopId) {
  const stop = await getBelgradeStop(stopId);
  const routeRef = stop.arrivals.find(
    (arrival) =>
      arrival.route?.lineId === lineId && arrival.route?.threadId === threadId,
  )?.route;
  if (!routeRef)
    throw Object.assign(new Error("Route is not available for selected stop"), {
      statusCode: 404,
    });
  const key = `${stopId}:${lineId}:${threadId}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.at < 300_000) return cached.promise;
  const entry = { at: Date.now() };
  const pageUrl = `https://yandex.com${routeRef.path}`;
  entry.promise = fetchPage(pageUrl)
    .then((html) => {
      const pageState = parsePageState(html);
      return {
        route: parseRoutePage(html, lineId, threadId, pageState),
        config: pageState.config,
        pageUrl,
      };
    })
    .catch((error) => {
      if (routeCache.get(key) === entry) routeCache.delete(key);
      throw error;
    });
  if (routeCache.size >= 32) routeCache.delete(routeCache.keys().next().value);
  routeCache.set(key, entry);
  return entry.promise;
}

async function getBelgradeRoute(lineId, threadId, stopId) {
  return (await getRoutePage(lineId, threadId, stopId)).route;
}

async function getBelgradeVehicles(stopId) {
  const stop = await getBelgradeStop(stopId);
  const routes = new Map();
  for (const arrival of stop.arrivals) {
    if (!arrival.isEstimated || !arrival.vehicleId || !arrival.route) continue;
    const key = `${arrival.route.lineId}:${arrival.route.threadId}`;
    const route = routes.get(key) || {
      reference: arrival.route,
      vehicleIds: new Set(),
    };
    route.vehicleIds.add(arrival.vehicleId);
    routes.set(key, route);
  }
  if (!routes.size) return { vehicles: [] };

  const results = await Promise.allSettled(
    [...routes.values()].map(async ({ reference, vehicleIds }) => {
      const { route, config, pageUrl } = await getRoutePage(
        reference.lineId,
        reference.threadId,
        stopId,
      );
      return (await fetchVehiclePositions(route, config, pageUrl)).filter(
        (vehicle) => vehicleIds.has(vehicle.id),
      );
    }),
  );
  const successful = results.filter((result) => result.status === "fulfilled");
  if (!successful.length) throw results[0].reason;
  return {
    vehicles: [
      ...new Map(
        successful
          .flatMap((result) => result.value)
          .map((vehicle) => [vehicle.id, vehicle]),
      ).values(),
    ],
  };
}

async function getBelgradeStop(stopId) {
  if (
    typeof stopId !== "string" ||
    !/^\d{1,20}$/.test(stopId) ||
    !knownStopIds.has(stopId)
  ) {
    throw Object.assign(new Error("Invalid Belgrade stop ID"), {
      statusCode: 400,
    });
  }
  const cached = stopCache.get(stopId);
  if (cached && Date.now() - cached.at < STOP_CACHE_TTL_MS) return cached.value;
  if (!stopInFlight.has(stopId)) {
    const request = fetchPage(
      `https://yandex.com/maps/10522/belgrade/stops/${stopId}/`,
    )
      .then((html) => parseStopPage(html, stopId))
      .then((value) => {
        stopCache.set(stopId, { value, at: Date.now() });
        return value;
      })
      .finally(() => stopInFlight.delete(stopId));
    stopInFlight.set(stopId, request);
  }
  return stopInFlight.get(stopId);
}

function resetCache() {
  stopCache.clear();
  stopInFlight.clear();
  upstreamCookies.clear();
  routeCache.clear();
}

module.exports = {
  belgradeStops,
  getBelgradeStop,
  getBelgradeRoute,
  getBelgradeVehicles,
  _test: {
    parseStopPage,
    parseRoutePage,
    parseVehiclePositions,
    toLatin,
    validateStops,
    resetCache,
  },
};
