FROM alpine:3.24.3

# Install Node.js 26 and runtime packages
RUN echo https://dl-cdn.alpinelinux.org/alpine/edge/main >> /etc/apk/repositories \
  && echo https://dl-cdn.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories \
  && apk add --no-cache git curl nodejs-current npm

# Create a non-root user for the application
RUN addgroup -S app && adduser -S -G app app

# Set the working directory
WORKDIR /app
RUN chown app:app /app

USER app

# Clone the repository
RUN git clone --depth 1 https://gitlab.com/Gor_ets/public-transport-in-serbia.git /app \
  && rm -rf /app/.git /app/tests

# Install project dependencies
RUN npm ci --omit=dev

# Run the project
CMD ["node", "server/server.js"]
