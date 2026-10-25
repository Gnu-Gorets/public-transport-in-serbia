const crypto = require("crypto");
const { state } = require("../state");
const {
  getAllStations,
  getAvailableCities,
  getStationInfo,
} = require("../services/providerService");
const { getRoute } = require("../services/routeService");
const { getStationSchedule } = require("../services/scheduleService");
const { getBelgradeStop, getBelgradeRoute, getBelgradeVehicles } = require("../services/yandexBelgradeService");
const { sendError } = require("../errors");
const {
  bgRouteParams,
  cityParams,
  routeQuery,
  stationScheduleQuery,
  stationSearchQuery,
} = require("./schemas");

const handle = (fn, fallback) => async (req, reply) => {
  try { await fn(req, reply); }
  catch (err) { req.log.error({ err }); sendError(reply, err, fallback); }
};

function registerApiRoutes(fastify) {
  fastify.register(async (app) => {
    app.get(
      "/api/bg/poc/routes/:lineId/:threadId",
      { schema: { params: bgRouteParams } },
      handle(async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        reply.send(await getBelgradeRoute(req.params.lineId, req.params.threadId));
      }, "Failed to fetch Yandex route"),
    );
    app.get(
      "/api/bg/poc/stop",
      handle(async (_req, reply) => {
        reply.header("Cache-Control", "no-store");
        reply.send(await getBelgradeStop());
      }, "Failed to fetch Yandex stop"),
    );
    app.get(
      "/api/bg/poc/vehicles",
      handle(async (_req, reply) => {
        reply.header("Cache-Control", "no-store");
        reply.send(await getBelgradeVehicles());
      }, "Failed to fetch Yandex vehicle positions"),
    );
  });

  fastify.get(
    "/api/stations/:city/search",
    { schema: { params: cityParams, querystring: stationSearchQuery } },
    handle(async (req, reply) => {
      reply.send(await getStationInfo(req.params.city, req.query));
    }, "Failed to fetch station"),
  );

  fastify.get(
    "/api/stations/:city/all",
    { schema: { params: cityParams } },
    handle(async (req, reply) => {
      reply.header("Cache-Control", "public, max-age=3600");
      reply.send(await getAllStations(req.params.city));
    }, "Failed to fetch stations"),
  );

  fastify.get(
    "/api/stations/:city/hash",
    { schema: { params: cityParams } },
    handle(async (req, reply) => {
      const stations = await getAllStations(req.params.city);
      const hash = crypto.createHash("sha256").update(JSON.stringify(stations)).digest("hex");
      reply.header("Cache-Control", "public, max-age=3600");
      reply.send({ hash });
    }, "Failed to compute stations hash"),
  );

  fastify.get(
    "/api/lines/:city",
    { schema: { params: cityParams } },
    handle(async (req, reply) => {
      const { city } = req.params;
      await getAllStations(city);
      reply.header("Cache-Control", "public, max-age=3600");
      reply.send(state.allLines[city] || {});
    }, "Failed to fetch lines"),
  );

  fastify.get("/health", async (request, reply) => {
    reply.send({ ok: true, uptime: process.uptime() });
  });

  fastify.get(
    "/api/cities",
    handle(async (req, reply) => {
      reply.send(getAvailableCities());
    }, "Failed to fetch cities"),
  );

  fastify.get(
    "/api/stations/:city/schedule",
    { schema: { params: cityParams, querystring: stationScheduleQuery } },
    handle(async (req, reply) => {
      const { city } = req.params;
      const { uid, date } = req.query;
      const response = await getStationSchedule(city, uid, date);
      if (!response) return reply.status(404).send({ error: "Station not found" });
      reply.send(response);
    }, "Failed to fetch schedule"),
  );

  fastify.get(
    "/api/route",
    { schema: { querystring: routeQuery } },
    handle(async (req, reply) => {
      reply.send(await getRoute(req.query.coords));
    }, "OSRM request failed"),
  );
}

module.exports = { registerApiRoutes };
