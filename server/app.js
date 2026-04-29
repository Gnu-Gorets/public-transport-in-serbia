const fastifyFactory = require("fastify");
const path = require("path");

const { registerApiRoutes } = require("./routes/apiRoutes");

function createApp(options = {}) {
  const fastify = fastifyFactory({
    logger: options.logger ?? process.env.NODE_ENV !== "test",
  });

  fastify.register(require("@fastify/static"), {
    root: path.join(__dirname, "../static"),
    prefix: "/static/",
  });
  fastify.register(require("@fastify/cors"), {
    origin: "*",
    methods: "*",
    allowedHeaders: "*",
  });

  registerApiRoutes(fastify);
  fastify.get("/", (request, reply) => reply.sendFile("index.html"));

  return fastify;
}

module.exports = {
  createApp,
};
