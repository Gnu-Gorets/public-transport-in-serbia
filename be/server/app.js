const fastifyFactory = require("fastify");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

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
    root: path.join(__dirname, "../../fe/static"),
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
  fastify.get("/service-worker.js", async (_request, reply) => {
    reply.header("Service-Worker-Allowed", "/");
    reply.type("application/javascript");
    return reply.sendFile("service-worker.js");
  });

  const handlerPath = path.join(__dirname, "../../build/handler.js");
  const serveApp = async (request, reply) => {
    const { handler } = await import(pathToFileURL(handlerPath));
    reply.hijack();
    handler(request.raw, reply.raw);
  };
  if (fs.existsSync(handlerPath) && process.env.NODE_ENV !== "test") {
    fastify.get("/", serveApp);
    fastify.setNotFoundHandler((request, reply) => {
      if (
        request.raw.url.startsWith("/api/") &&
        request.raw.url.split("?", 1)[0] !== "/api/v2"
      )
        return reply.code(404).send({ error: "Not found" });
      return serveApp(request, reply);
    });
  }

  return fastify;
}

module.exports = {
  createApp,
};
