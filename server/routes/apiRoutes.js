const state = require("../state");
const {
  getAllStations,
  getAvailableCities,
  getStationInfo,
} = require("../services/providerService");
const { getRoute } = require("../services/routeService");
const { getStationSchedule } = require("../services/scheduleService");
const { sendError } = require("../errors");

function registerApiRoutes(fastify) {
  fastify.get("/api/stations/:city/search", async (request, reply) => {
    const city = request.params.city;
    try {
      const response = await getStationInfo(city, request.query);
      reply.send(response);
    } catch (err) {
      console.error(err);
      sendError(reply, err, "Failed to fetch station");
    }
  });

  fastify.get("/api/stations/:city/all", async (request, reply) => {
    const city = request.params.city;
    try {
      const response = await getAllStations(city);
      reply.send(response);
    } catch (err) {
      console.error(err);
      sendError(reply, err, "Failed to fetch stations");
    }
  });

  fastify.get("/api/lines/:city", async (request, reply) => {
    const city = request.params.city;
    const allLines = state.getAllLines();
    try {
      if (!allLines[city]) await getAllStations(city);
      reply.send(allLines[city] || {});
    } catch (err) {
      console.error(err);
      sendError(reply, err, "Failed to fetch lines");
    }
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

  fastify.get("/api/stations/:city/schedule", async (request, reply) => {
    const city = request.params.city;
    const { uid, date } = request.query;

    if (!uid) return reply.status(400).send({ error: "uid is required" });

    try {
      const response = await getStationSchedule(city, uid, date);
      if (!response)
        return reply.status(404).send({ error: "Station not found" });

      reply.send(response);
    } catch (err) {
      console.error(err);
      sendError(reply, err, "Failed to fetch schedule");
    }
  });

  fastify.get("/api/route", async (request, reply) => {
    const { coords } = request.query;
    try {
      const response = await getRoute(coords);
      reply.send(response);
    } catch (err) {
      console.error(err);
      reply.status(502).send({ error: "OSRM request failed" });
    }
  });
}

module.exports = {
  registerApiRoutes,
};
