# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js standalone server.
# Produces a small runtime image that runs `node server.js` on port 3000.

# ---- deps: install dependencies ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: build the standalone output ----
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build && node scripts/copy-standalone.mjs

# ---- runner: minimal runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next standalone reads PORT + HOSTNAME; bind 0.0.0.0 so the container is reachable.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as the non-root node user
USER node

# The standalone bundle (server.js, minimal node_modules, .next) + static assets.
# copy-standalone.mjs already placed static under .next/standalone/.next/static.
COPY --from=builder --chown=node:node /app/.next/standalone ./

EXPOSE 3000
CMD ["node", "server.js"]
