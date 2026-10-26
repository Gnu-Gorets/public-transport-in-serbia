const fastifyFactory = require("fastify");
const path = require("path");

const { registerApiRoutes } = require("./routes/apiRoutes");

function createApp(options = {}) {
  const fastify = fastifyFactory({
    logger:
      options.logger ??
      (process.env.NODE_ENV === "test"
        ? false
        : {
            transport:
              process.env.NODE_ENV === "production"
                ? undefined
                : {
                    target: "pino-pretty",
                    options: {
                      colorize: true,
                      translateTime: "SYS:standard",
                      ignore: "pid,hostname",
                      singleLine: true,
                    },
                  },
          }),
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
  fastify.register(require("@fastify/rate-limit"), {
    max: 60,
    timeWindow: "1 minute",
  });

  registerApiRoutes(fastify);
  fastify.get("/", (request, reply) => reply.sendFile("index.html"));

  return fastify;
}

module.exports = {
  createApp,
};
