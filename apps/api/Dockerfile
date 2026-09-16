# Production Dockerfile for MetraScan Express API
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install pnpm matching packageManager in root package.json
RUN npm install -g pnpm@11.19.0

# Copy workspace and package definitions
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/legal-engine/package.json packages/legal-engine/tsconfig.json ./packages/legal-engine/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma

# Install dependencies for api and legal-engine packages
RUN pnpm install --frozen-lockfile --filter api... --filter @metrascan/legal-engine...

# Copy source code
COPY packages/legal-engine/src ./packages/legal-engine/src
COPY apps/api/src ./apps/api/src

# Generate Prisma Client
RUN pnpm --filter api db:generate

# Build legal-engine and API
RUN pnpm --filter @metrascan/legal-engine build
RUN pnpm --filter api build
RUN cp -r apps/api/src/generated apps/api/dist/generated

# Production runner image
FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN npm install -g pnpm@11.19.0

# Install OpenSSL for Prisma runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy built application and dependencies from builder
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml /app/tsconfig.base.json ./
COPY --from=builder /app/packages/legal-engine ./packages/legal-engine
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV STORAGE_PATH=/data/storage
ENV API_PORT=4000

# Create persistent storage directory
RUN mkdir -p /data/storage

VOLUME /data/storage

EXPOSE 4000

WORKDIR /app/apps/api

CMD ["node", "dist/server.js"]
