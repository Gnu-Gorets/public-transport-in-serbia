FROM node:26-alpine

RUN addgroup -S app \
  && adduser -S -G app app \
  && apk add --no-cache git \
  && git clone --depth 1 https://github.com/Gnu-Gorets/public-transport-in-serbia.git /app \
  && rm -rf /app/.git /app/tests \
  && apk del git \
  && chown -R app:app /app

# Set the working directory
WORKDIR /app
USER app

# Install project dependencies and build the SvelteKit app
RUN npm ci && npm run build && npm prune --omit=dev

# Run the project
CMD ["node", "server/server.js"]
