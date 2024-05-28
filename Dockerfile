# Use the base image Ubuntu 24.04
FROM ubuntu:24.04

# Update and install necessary packages
RUN apt-get update && apt-get install -y \
    git \
    curl

# Install Node.js
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Clone the repository
RUN git clone https://gitlab.com/Gor_ets/public-transport-in-serbia.git /app

# Set the working directory
WORKDIR /app

# Install project dependencies
RUN npm ci

# Run the project
CMD ["npm", "run", "dev"]
