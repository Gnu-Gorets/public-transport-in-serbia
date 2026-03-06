FROM alpine:3.23.3

# Update and install necessary packages
RUN apk add --no-cache git curl nodejs npm

# Clone the repository
RUN git clone https://gitlab.com/Gor_ets/public-transport-in-serbia.git /app

# Set the working directory
WORKDIR /app

# Install project dependencies
RUN npm ci

# Run the project
CMD ["node", "server/server.js"]
