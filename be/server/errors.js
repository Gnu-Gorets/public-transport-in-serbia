class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

const badRequest = (message) => new HttpError(400, message);
const upstreamError = (message) => new HttpError(502, message);

function sendError(reply, err, fallbackMessage = "Internal server error") {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : err.message;
  return reply.status(statusCode).send({ error: message });
}

module.exports = {
  HttpError,
  badRequest,
  upstreamError,
  sendError,
};
