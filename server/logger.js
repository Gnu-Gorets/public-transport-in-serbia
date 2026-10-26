const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  enabled: process.env.NODE_ENV !== "test",
  transport: process.env.NODE_ENV === "production" ? undefined : {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname", singleLine: true },
  },
});

module.exports = logger;
