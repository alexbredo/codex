# Dockerfile for CodexStructure

# ---- Builder Stage ----
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy application code
COPY . .

# Set NEXT_TELEMETRY_DISABLED to 1 to disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1

# Build the Next.js application
RUN npm run build

# ---- Runner Stage ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production
# Disable telemetry in the running container
ENV NEXT_TELEMETRY_DISABLED 1

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The SQLite database will be expected in /app/data/database.sqlite
# This directory will be created by the application if it doesn't exist,
# and should be mounted as a volume from the host for persistence.

EXPOSE 3000

# CMD to run the application
# The standalone output creates a server.js file.
CMD ["node", "server.js"]
