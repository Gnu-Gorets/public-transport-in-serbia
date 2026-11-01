# Clone source in temporary stage so Git stays out of runtime image.
FROM node:26-alpine AS source

RUN apk add --no-cache git \
  && git clone --depth 1 --branch main https://github.com/Gnu-Gorets/public-transport-in-serbia.git /app \
  && rm -rf /app/.git /app/tests \
  && apk del git

FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app && chown app:app /app

# Install the pinned package manager before dropping privileges.
RUN npm install --global --allow-scripts=pnpm pnpm@12.16.1

# Copy manifests first so source changes do not invalidate dependency layer.
COPY --from=source --chown=app:app /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

USER 10001

# Build tools are needed despite NODE_ENV=production; prune them after build.
RUN pnpm install --frozen-lockfile --prod=false

COPY --from=source --chown=app:app /app/ ./

RUN pnpm run build && pnpm install --prod --frozen-lockfile

ENTRYPOINT ["node", "be/server/server.js"]
