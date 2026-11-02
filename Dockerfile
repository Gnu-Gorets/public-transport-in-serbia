# Clone selected source ref in temporary stage so Git stays out of runtime image.
FROM node:26-alpine AS source
ARG SOURCE_REF=main

RUN apk add --no-cache git \
  && git clone --depth 1 --branch "$SOURCE_REF" https://github.com/Gnu-Gorets/public-transport-in-serbia.git /app \
  && rm -rf /app/.git /app/tests \
  && apk del git

FROM node:26-alpine

# Create non-root user for application
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
# Dev script uses curl to wait for API.
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app
RUN chown app:app /app

# Install pinned package manager before dropping privileges.
RUN npm install --global --allow-scripts=pnpm pnpm@12.16.1

USER 10001

# Install project dependencies and copy application files.
COPY --from=source --chown=app:app /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --from=source --chown=app:app /app/be ./be
COPY --from=source --chown=app:app /app/fe ./fe
COPY --from=source --chown=app:app /app/scripts ./scripts
COPY --from=source --chown=app:app /app/vite.config.mjs /app/tsconfig.json ./

# Start development server.
ENTRYPOINT ["pnpm", "run", "dev"]
