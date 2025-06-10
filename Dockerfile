
# Stage 1: Build the application
FROM node:20-slim AS builder

WORKDIR /app

# Install necessary build tools for native modules (like sqlite3)
# and ca-certificates for potential SSL issues during downloads
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
# Copy package.json and package-lock.json (or yarn.lock)
COPY package.json package-lock.json* ./
# Using npm ci for cleaner installs from lock file
RUN npm ci

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Production image
# Use a slim Node.js image for the final stage
FROM node:20-slim AS runner

WORKDIR /app

# Set environment to production
ENV NODE_ENV production

# Create a non-root user for security
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Copy built assets from the builder stage
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

# Create the data directory and set permissions if it doesn't exist
# This directory will be used for the SQLite database and uploads
# Ensure the appuser has write permissions if the volume isn't mounted or is empty
RUN mkdir -p /app/data/uploads && \
    chown -R appuser:appgroup /app/data

USER appuser

EXPOSE 3000

# Start the Next.js application
CMD ["node", "server.js"]
