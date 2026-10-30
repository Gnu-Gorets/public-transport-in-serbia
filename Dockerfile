FROM node:26-alpine AS source

RUN apk add --no-cache git
RUN git clone --depth 1 --branch main https://github.com/Gnu-Gorets/public-transport-in-serbia.git /app
RUN rm -rf /app/.git /app/tests

FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S app && adduser -S -G app app && chown app:app /app

COPY --from=source --chown=app:app /app/package.json /app/package-lock.json /app/.npmrc ./

USER app

RUN npm ci --include=dev

COPY --from=source --chown=app:app /app/ ./

RUN npm run build && npm prune --omit=dev

CMD ["node", "be/server/server.js"]
