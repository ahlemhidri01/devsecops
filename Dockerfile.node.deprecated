# ==============================================================
# SecureBank — Multi-stage Dockerfile
# Optimized for security, size, and CI/CD pipelines
# ==============================================================

# 1. Base Stage: Install dependencies
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
# Use non-root user even in base stage where possible
RUN npm ci

# 2. Build Stage: Compile TypeScript and Prisma
FROM base AS builder
WORKDIR /app
COPY . .
# Generate Prisma Client
RUN npx prisma generate
# Compile TypeScript to JavaScript
RUN npm run build

# 3. Production Dependencies Stage: Strip dev dependencies
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 4. Final Production Image
FROM node:20-alpine AS production

# Add security updates and dumb-init for proper signal handling
RUN apk add --no-cache dumb-init && \
    apk upgrade --no-cache

WORKDIR /app

# Run as non-root user for security (Kubernetes PodSecurityPolicy requirement)
RUN addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S nodejs -G nodejs
USER nodejs

# Copy essential files from previous stages
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/src/prisma ./prisma
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package.json ./

# Environment configuration
ENV NODE_ENV=production
ENV PORT=3000

# Expose the application port
EXPOSE 3000

# Health check instruction for Docker orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Start using dumb-init to handle PID 1 signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
