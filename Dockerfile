FROM alpine:3.23.4

# Update and install necessary packages
RUN apk add --no-cache git curl nodejs npm

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
