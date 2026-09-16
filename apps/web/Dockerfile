# Production Dockerfile for MetraScan React/Vite Frontend
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@11.19.0

# Copy workspace configuration and web package definition
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/

# Install dependencies for web
RUN pnpm install --frozen-lockfile --filter web...

# Copy web source and build
COPY apps/web ./apps/web
RUN pnpm --filter web build

# Production server using Nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
