# Clone source in a temporary stage so Git stays out of the runtime image.
FROM node:26-alpine AS source

RUN apk add --no-cache git \
  && git clone --depth 1 --branch main https://github.com/Gnu-Gorets/public-transport-in-serbia.git /app \
  && rm -rf /app/.git /app/tests \
  && apk del git

FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S app && adduser -S -G app app && chown app:app /app

# Copy manifests first so source changes do not invalidate the dependency layer.
COPY --from=source --chown=app:app /app/package.json /app/package-lock.json /app/.npmrc ./

USER app

# Build tools are needed despite NODE_ENV=production; prune them after the build.
RUN npm ci --include=dev

COPY --from=source --chown=app:app /app/ ./

RUN npm run build && npm prune --omit=dev

CMD ["node", "be/server/server.js"]
