# Use the official Node.js 20 image
FROM node:20-slim

# Install necessary build tools for native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm@8.6.12

# Set working directory
WORKDIR /app

# Copy workspace and package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

# Install dependencies (including dev dependencies)
RUN pnpm install --prod=false

# Copy the rest of your source code
COPY . .

# Build the frontend (web) and backend (api)
RUN pnpm run build:web
RUN pnpm run build:api

# Expose the port your app runs on
EXPOSE 3000

# Start the backend API
CMD ["pnpm", "--filter", "api", "start"]