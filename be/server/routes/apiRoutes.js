const crypto = require("crypto");
const { state } = require("../state");
const {
  getAllStations,
  getAvailableCities,
  getStationInfo,
} = require("../services/providerService");
const { getRoute } = require("../services/routeService");
const { getStationSchedule } = require("../services/scheduleService");
const {
  getBelgradeStop,
  getBelgradeRoute,
  getBelgradeVehicles,
  belgradeStops,
} = require("../services/yandexBelgradeService");
const { badRequest, sendError } = require("../errors");
const alertsService = require("../services/alertsService");
const {
  bgRouteParams,
  bgStopQuery,
  cityParams,
  routeQuery,
  stationScheduleQuery,
  stationSearchQuery,
} = require("./schemas");

const handle = (fn, fallback) => async (req, reply) => {
  try {
    await fn(req, reply);
  } catch (err) {
    req.log.error({ err });
    sendError(reply, err, fallback);
  }
};

function registerApiRoutes(fastify) {
  fastify.register(async (app) => {
    const registerBgEndpoint = (path, schema, getData, fallback) => {
      app.get(
        path,
        { schema },
        handle(async (req, reply) => {
          reply.header("Cache-Control", "no-store");
          reply.send(await getData(req));
        }, fallback),
      );
    };
    registerBgEndpoint(
      "/api/bg/routes/:lineId/:threadId",
      { params: bgRouteParams, querystring: bgStopQuery },
      (req) =>
        getBelgradeRoute(
          req.params.lineId,
          req.params.threadId,
          req.query.stopId,
        ),
      "Failed to fetch Yandex route",
    );
    registerBgEndpoint(
      "/api/bg/stop",
      { querystring: bgStopQuery },
      (req) => getBelgradeStop(req.query.stopId),
      "Failed to fetch Yandex stop",
    );
    registerBgEndpoint(
      "/api/bg/vehicles",
      { querystring: bgStopQuery },
      (req) => getBelgradeVehicles(req.query.stopId),
      "Failed to fetch Yandex vehicle positions",
    );
  });

  fastify.get("/api/bg/stops", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=3600");
    reply.send(belgradeStops);
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
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(stations))
        .digest("hex");
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

  fastify.post(
    "/api/v2/alerts/evaluate",
    {
      bodyLimit: 8192,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      try {
        return reply.send({
          results: await alertsService.evaluateLocalAlerts(
            request.body?.alerts,
          ),
        });
      } catch (error) {
        const statusCode = Number.isInteger(error.statusCode)
          ? error.statusCode
          : 400;
        return reply.code(statusCode).send({ error: error.message });
      }
    },
  );

  fastify.get("/api/v2/alerts/vapid-key", async (_request, reply) => {
    if (!alertsService.configured())
      return reply.code(503).send({ error: "Push alerts are not configured" });
    alertsService.configureVapid();
    return reply.send({ publicKey: process.env.VAPID_PUBLIC_KEY });
  });

  fastify.put(
    "/api/v2/alerts",
    {
      bodyLimit: 4096,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      if (!alertsService.configured())
        return reply
          .code(503)
          .send({ error: "Push alerts are not configured" });
      try {
        if (Buffer.byteLength(JSON.stringify(request.body)) > 4096)
          return reply.code(413).send({ error: "Alert request is too large" });
        alertsService.configureVapid();
        const { subscription, alerts } = request.body || {};
        return reply.send(
          await alertsService.replaceAlerts(subscription, alerts),
        );
      } catch (error) {
        const statusCode = Number.isInteger(error.statusCode)
          ? error.statusCode
          : 400;
        return reply.code(statusCode).send({ error: error.message });
      }
    },
  );

  fastify.delete(
    "/api/v2/alerts",
    { bodyLimit: 4096 },
    async (request, reply) => {
      if (!alertsService.configured())
        return reply
          .code(503)
          .send({ error: "Push alerts are not configured" });
      try {
        await alertsService.removeSubscription(request.body?.endpoint);
        return reply.code(204).send();
      } catch (error) {
        const statusCode = Number.isInteger(error.statusCode)
          ? error.statusCode
          : 400;
        return reply.code(statusCode).send({ error: error.message });
      }
    },
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
      if (date) {
        const [year, month, day] = date.split("-").map(Number);
        const leapYear =
          year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const daysInMonth = [
          31,
          leapYear ? 29 : 28,
          31,
          30,
          31,
          30,
          31,
          31,
          30,
          31,
          30,
          31,
        ];
        if (
          year < 1 ||
          month < 1 ||
          month > 12 ||
          day < 1 ||
          day > daysInMonth[month - 1]
        ) {
          throw badRequest("Invalid schedule date");
        }
      }
      const response = await getStationSchedule(city, uid, date);
      if (!response)
        return reply.status(404).send({ error: "Station not found" });
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
