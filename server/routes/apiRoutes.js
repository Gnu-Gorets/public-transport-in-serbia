const state = require("../state");
const {
  getAllStations,
  getAvailableCities,
  getStationInfo,
} = require("../services/providerService");
const { getRoute } = require("../services/routeService");
const { getStationSchedule } = require("../services/scheduleService");
const { sendError } = require("../errors");
const {
  cityParams,
  routeQuery,
  stationScheduleQuery,
  stationSearchQuery,
} = require("./schemas");

function registerApiRoutes(fastify) {
  fastify.get(
    "/api/stations/:city/search",
    {
      schema: {
        params: cityParams,
        querystring: stationSearchQuery,
      },
    },
    async (request, reply) => {
      const city = request.params.city;
      try {
        const response = await getStationInfo(city, request.query);
        reply.send(response);
      } catch (err) {
        request.log.error({ err });
        sendError(reply, err, "Failed to fetch station");
      }
    },
  );

  fastify.get(
    "/api/stations/:city/all",
    {
      schema: {
        params: cityParams,
      },
    },
    async (request, reply) => {
      const city = request.params.city;
      try {
        const response = await getAllStations(city);
        reply.header("Cache-Control", "public, max-age=3600");
        reply.send(response);
      } catch (err) {
        request.log.error({ err });
        sendError(reply, err, "Failed to fetch stations");
      }
    },
  );

  fastify.get(
    "/api/lines/:city",
    {
      schema: {
        params: cityParams,
      },
    },
    async (request, reply) => {
      const city = request.params.city;
      const allLines = state.getAllLines();
      try {
        if (!allLines[city]) await getAllStations(city);
        reply.header("Cache-Control", "public, max-age=3600");
        reply.send(allLines[city] || {});
      } catch (err) {
        request.log.error({ err });
        sendError(reply, err, "Failed to fetch lines");
      }
    },
  );

  fastify.get("/health", async (request, reply) => {
    reply.send({ ok: true, uptime: process.uptime() });
  });

  fastify.get("/api/cities", async (request, reply) => {
    try {
      const response = await getAvailableCities();
      reply.send(response);
    } catch (err) {
      console.error(err);
      sendError(reply, err, "Failed to fetch cities");
    }
  });

  fastify.get(
    "/api/stations/:city/schedule",
    {
      schema: {
        params: cityParams,
        querystring: stationScheduleQuery,
      },
    },
    async (request, reply) => {
      const city = request.params.city;
      const { uid, date } = request.query;

      try {
        const response = await getStationSchedule(city, uid, date);
        if (!response)
          return reply.status(404).send({ error: "Station not found" });

        reply.send(response);
      } catch (err) {
        request.log.error({ err });
        sendError(reply, err, "Failed to fetch schedule");
      }
    },
  );

  fastify.get(
    "/api/route",
    {
      schema: {
        querystring: routeQuery,
      },
    },
    async (request, reply) => {
      const { coords } = request.query;
      try {
        const response = await getRoute(coords);
        reply.send(response);
      } catch (err) {
        request.log.error({ err });
        reply.status(502).send({ error: "OSRM request failed" });
      }
    },
  );
}

module.exports = {
  registerApiRoutes,
};
