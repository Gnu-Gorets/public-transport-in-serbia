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

function parseStopPage(html) {
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

async function fetchBelgradeStop() {
  let response;
  try {
    response = await getHttpClient().get(STOP_URL, {
      timeout: STOP_PAGE_TIMEOUT_MS,
      maxContentLength: MAX_STOP_PAGE_BYTES,
      responseType: "text",
      headers: { Accept: "text/html" },
    });
  } catch (err) {
    throw upstreamError(err.message || "Yandex stop page request failed");
  }

  if (response.status !== 200 || typeof response.data !== "string") {
    throw upstreamError("Yandex stop page returned an invalid response");
  }
  return parseStopPage(response.data);
}

async function getBelgradeStop() {
  if (cachedStop && Date.now() - cachedAt < STOP_CACHE_TTL_MS) return cachedStop;
  if (!inFlight) {
    inFlight = fetchBelgradeStop()
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
}

module.exports = { getBelgradeStop, _test: { parseStopPage, toLatin, resetCache } };
