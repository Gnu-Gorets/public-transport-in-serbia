const { createApp } = require("./app");
const { resetHttpClient, setHttpClient } = require("./httpClient");
const logger = require("./logger");
const { resetState, setState } = require("./state");
const providerService = require("./services/providerService");
const {
  transformAllLinesResponse,
  transformAllStationsResponse,
  transformStationResponse,
} = require("./transforms");

const fastify = createApp();

const resetAll = () => {
  resetState();
  resetHttpClient();
  providerService._test.resetNow();
  providerService._test.resetInFlight();
};

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    logger.error({ err }, "Server startup failed");
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

module.exports = {
  fastify,
  start,
  _test: {
    resetState: resetAll,
    setState,
    setHttpClient,
    setNow: providerService._test.setNow,
    transformAllStationsResponse,
    transformAllLinesResponse,
    transformStationResponse,
  },
};
