# syntax=docker/dockerfile:1

# ---- deps: install once, reused by dev and builder -------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- dev: live-reload dev server, source comes from a bind mount ----------
FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- builder: production build ---------------------------------------------
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

# ---- prod: minimal standalone runtime ---------------------------------------
FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container ID by default; server.js binds to
# process.env.HOSTNAME, so left alone it listens only on that resolved
# address instead of all interfaces. Override it explicitly.
ENV HOSTNAME=0.0.0.0

RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data && chown -R app:app /app/data

COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/db ./db

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
