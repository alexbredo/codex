
# Stage 1: Builder
FROM node:20-slim AS builder
LABEL authors="firebase-studio"

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (like sqlite3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Runner
FROM node:20-slim AS runner
LABEL authors="firebase-studio"

WORKDIR /app

# Create a non-root user and group
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

# Set environment variables
ENV NODE_ENV=production
# The Next.js server will run on port 3000 by default
ENV PORT=3000

# Copy only necessary files from the builder stage
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
# The /app/public directory is often not present or needed with output: 'standalone'
# as assets are typically served from .next/server/public or handled differently.
# COPY --from=builder --chown=appuser:appgroup /app/public ./public

# Create the data directory and uploads subdirectory and set permissions
# This ensures the directory exists and is writable by the appuser
# The volume mount will then correctly map to this pre-existing, permissioned directory.
RUN mkdir -p /app/data/uploads && \
    chown -R appuser:appgroup /app/data

# Switch to the non-root user
USER appuser

# Expose port 3000
EXPOSE 3000

# Command to run the application
CMD ["node", "server.js"]
