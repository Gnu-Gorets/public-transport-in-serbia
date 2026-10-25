const { getHttpClient } = require("../httpClient");
const { upstreamError } = require("../errors");

const STOP_ID = "3833919270";
const STOP_URL = `https://yandex.com/maps/10522/belgrade/stops/${STOP_ID}/`;
const STOP_PAGE_TIMEOUT_MS = 5000;
const MAX_STOP_PAGE_BYTES = 1_000_000;
const STOP_CACHE_TTL_MS = 30_000;
let cachedStop;
let cachedAt = 0;
let inFlight;
const routeCache = new Map();
const SERBIAN_CYRILLIC = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Ђ: "Đ", Е: "E", Ж: "Ž", З: "Z", И: "I", Ј: "J", К: "K", Л: "L", Љ: "Lj", М: "M", Н: "N", Њ: "Nj", О: "O", П: "P", Р: "R", С: "S", Т: "T", Ћ: "Ć", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "Č", Џ: "Dž", Ш: "Š",
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š",
};

function toLatin(text) {
  if (typeof text !== "string") return text;
  return text.replace(/[А-Яа-яЂђЈјЉљЊњЋћЏџ]/g, (letter) => SERBIAN_CYRILLIC[letter] || letter);
}

function toIsoTime(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > 8_640_000_000_000) return null;
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

function parseStopPage(html) {
  const pageState = parsePageState(html);
  const stop = pageState.config?.masstransitStop;
  if (
    !stop ||
    String(stop.id) !== STOP_ID ||
    typeof stop.name !== "string" ||
    !Array.isArray(stop.coordinates) ||
    stop.coordinates.length !== 2 ||
    !stop.coordinates.every(Number.isFinite) ||
    !Array.isArray(stop.transports)
  ) {
    throw upstreamError("Yandex stop data is invalid");
  }

  const arrivals = stop.transports.flatMap((transport) =>
    (transport?.threads || []).flatMap((thread) =>
      (thread?.BriefSchedule?.Events || []).flatMap((event) => {
        const scheduledAt = toIsoTime(event?.Scheduled?.value);
        const estimatedAt = toIsoTime(event?.Estimated?.value);
        if (!scheduledAt && !estimatedAt) return [];
        const destination = thread.EssentialStops?.at(-1)?.name;

        return [{
          lineNumber: String(transport.name),
          transportType: transport.type || null,
          destination: destination ? toLatin(destination) : null,
          scheduledAt,
          estimatedAt,
          vehicleId: event.vehicleId || null,
          isEstimated: Boolean(estimatedAt),
          route: routeReference(transport, thread),
        }];
      }),
    ),
  );

  return {
    city: "bg",
    name: toLatin(stop.name),
    uid: STOP_ID,
    id: STOP_ID,
    coords: [stop.coordinates[1], stop.coordinates[0]],
    arrivals,
  };
}

function routeReference(transport, thread) {
  if (!/^\d+$/.test(transport.lineId) || !/^\d+$/.test(thread.threadId) ||
      !["bus", "trolleybus", "tram", "minibus"].includes(transport.type) ||
      typeof transport.uri !== "string" || !transport.uri.startsWith("ymapsbm1://transit/line?") ||
      typeof transport.seoname !== "string" || !/^[\w-]+$/.test(transport.seoname)) return null;
  let uri;
  try { uri = new URL(transport.uri); } catch { return null; }
  if (uri.searchParams.get("id") !== transport.lineId) return null;
  return {
    lineId: transport.lineId,
    threadId: thread.threadId,
    path: `/maps/10522/belgrade/routes/${transport.type}_${transport.seoname}/${Buffer.from(transport.uri).toString("hex")}/`,
  };
}

function validCoordinates(coords) {
  return Array.isArray(coords) && coords.length === 2 && coords.every(Number.isFinite) &&
    Math.abs(coords[0]) <= 180 && Math.abs(coords[1]) <= 90;
}

function parseRoutePage(html, lineId, threadId) {
  const line = parsePageState(html).config?.masstransitLine;
  const thread = Array.isArray(line?.features) && line.features.find((item) =>
    item?.properties?.ThreadMetaData?.id === threadId &&
    item.properties.ThreadMetaData.lineId === lineId);
  if (!thread || !Array.isArray(thread.features) || typeof thread.properties.ThreadMetaData.name !== "string") {
    throw upstreamError("Yandex route direction not found");
  }
  const stops = [];
  const segments = [];
  for (const feature of thread.features) {
    if (!feature || typeof feature !== "object") throw upstreamError("Yandex route feature is invalid");
    if (feature.points !== undefined) {
      if (!Array.isArray(feature.points) || !feature.points.every(validCoordinates)) {
        throw upstreamError("Yandex route geometry is invalid");
      }
      segments.push(feature.points.map(([lon, lat]) => [lat, lon]));
    } else if (feature.id !== undefined) {
      if (typeof feature.name !== "string" || !validCoordinates(feature.coordinates)) {
        throw upstreamError("Yandex route stop is invalid");
      }
      stops.push({ id: String(feature.id), name: toLatin(feature.name), coords: [feature.coordinates[1], feature.coordinates[0]] });
    }
  }
  if (stops.length < 2 || !segments.some((segment) => segment.length >= 2)) {
    throw upstreamError("Yandex route data is incomplete");
  }
  return { lineId, threadId, name: String(thread.properties.ThreadMetaData.name), stops, segments };
}

async function fetchPage(url) {
  let response;
  try {
    response = await getHttpClient().get(url, {
      timeout: STOP_PAGE_TIMEOUT_MS,
      maxContentLength: MAX_STOP_PAGE_BYTES,
      responseType: "text",
      headers: { Accept: "text/html", "User-Agent": "SerbiaTransport/1.0" },
    });
  } catch (err) {
    throw upstreamError(err.message || "Yandex page request failed");
  }

  if (response.status !== 200 || typeof response.data !== "string") {
    throw upstreamError("Yandex page returned invalid response");
  }
  return response.data;
}

async function getBelgradeRoute(lineId, threadId) {
  const stop = await getBelgradeStop();
  const route = stop.arrivals.find((arrival) => arrival.route?.lineId === lineId && arrival.route?.threadId === threadId)?.route;
  if (!route) throw Object.assign(new Error("Route is not available for selected stop"), { statusCode: 404 });
  const key = `${lineId}:${threadId}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.at < 300_000) return cached.promise;
  const entry = { at: Date.now() };
  entry.promise = fetchPage(`https://yandex.com${route.path}`)
    .then((html) => parseRoutePage(html, lineId, threadId))
    .catch((error) => { if (routeCache.get(key) === entry) routeCache.delete(key); throw error; });
  if (routeCache.size >= 32) routeCache.delete(routeCache.keys().next().value);
  routeCache.set(key, entry);
  return entry.promise;
}

async function getBelgradeStop() {
  if (cachedStop && Date.now() - cachedAt < STOP_CACHE_TTL_MS) return cachedStop;
  if (!inFlight) {
    inFlight = fetchPage(STOP_URL).then(parseStopPage)
      .then((stop) => {
        cachedStop = stop;
        cachedAt = Date.now();
        return stop;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

function resetCache() {
  cachedStop = undefined;
  cachedAt = 0;
  inFlight = null;
  routeCache.clear();
}

module.exports = { getBelgradeStop, getBelgradeRoute, _test: { parseStopPage, parseRoutePage, toLatin, resetCache } };
