FROM node:26-alpine AS build
WORKDIR /app
RUN npm install --global --allow-scripts=pnpm pnpm@12.16.1
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY be ./be
COPY fe ./fe
COPY scripts ./scripts
COPY vite.config.mjs tsconfig.json ./
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm run build

FROM node:26-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY package.json pnpm-lock.yaml ./
RUN npm install --global --allow-scripts=pnpm pnpm@12.16.1 \
  && pnpm install --prod --frozen-lockfile \
  && npm uninstall --global pnpm \
  && npm cache clean --force
COPY --chown=app:app be ./be
COPY --chown=app:app fe/static ./fe/static
COPY --from=build --chown=app:app /app/build ./build
USER 10001
EXPOSE 3000
CMD ["node", "be/server/server.js"]
