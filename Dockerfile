FROM node:22-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDeps for build)
RUN npm ci

# Copy source
COPY . .

# Build Astro
RUN npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

# Data directory for SQLite volume
RUN mkdir -p /data

# Force binding to all interfaces (required for Railway proxy)
ENV HOST=0.0.0.0

# Expose default port
EXPOSE 4321

# Railway injects $PORT — standalone server reads HOST + PORT env vars
CMD node dist/server/entry.mjs
