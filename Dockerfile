FROM alpine:3.24.3

# Install Node.js 26 and runtime packages
RUN echo https://dl-cdn.alpinelinux.org/alpine/edge/main >> /etc/apk/repositories \
  && echo https://dl-cdn.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories \
  && apk add --no-cache git nodejs-current npm \
  && addgroup -S app \
  && adduser -S -G app app \
  && git clone --depth 1 https://github.com/Gnu-Gorets/public-transport-in-serbia.git /app \
  && rm -rf /app/.git /app/tests \
  && apk del git \
  && chown -R app:app /app

# Set the working directory
WORKDIR /app
USER app

# Install project dependencies
RUN npm ci --omit=dev

# Run the project
CMD ["node", "server/server.js"]
