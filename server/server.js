const { createApp } = require("./app");
const { resetHttpClient, setHttpClient } = require("./httpClient");
const state = require("./state");
const { populateMap } = require("./services/providerService");
const {
  transformAllLinesResponse,
  transformAllStationsResponse,
  transformStationResponse,
} = require("./transforms");

const fastify = createApp();

const resetState = () => {
  state.resetState();
  resetHttpClient();
};

const start = async () => {
  try {
    await populateMap(true);
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    console.error(err);
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
    resetState,
    setState: state.setState,
    setHttpClient,
    transformAllStationsResponse,
    transformAllLinesResponse,
    transformStationResponse,
  },
};
