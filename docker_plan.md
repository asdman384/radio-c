# Docker packaging plan — Radio Calico

## Goal
Self-contained Docker setup with separate **dev** (live reload) and **prod**
(minimal, standalone) modes, deployable on Windows 11 + Docker Desktop (WSL2
backend).

## Confirmed decisions
1. **Prod build**: add `output: "standalone"` to `next.config.ts` so the prod
   image ships only the traced server bundle, not the full `node_modules`/source.
2. **Dev workflow**: bind-mount the repo into the container and run `next dev`
   for live reload, matching normal local dev.
3. **Prod DB persistence**: named Docker volume `radio-data` mounted at
   `/app/data`, with `DATABASE_PATH=/app/data/app.db`.
4. **File layout**: one multi-stage `Dockerfile` (`deps` → `dev` / `builder` →
   `prod` stages) plus two compose files: `docker-compose.yml` (prod) and
   `docker-compose.dev.yml` (dev).

## Files to add/change

### 1. `next.config.ts`
Add `output: "standalone"`.

### 2. `Dockerfile` (multi-stage)
- **base**: `node:24-alpine`, sets `WORKDIR /app`.
- **deps**: `npm ci` (full deps, needed for both dev and the build step).
- **dev**: from `deps`, copies source, runs `npm run dev`, exposes 3000.
  Source itself comes from the bind mount at runtime — the `COPY` here just
  makes the image usable standalone too.
- **builder**: from `deps`, copies source, runs `npm run build` (produces
  `.next/standalone`, `.next/static`).
- **prod**: fresh `node:24-alpine` layer (not built on `deps`), copies only:
  - `.next/standalone` (self-contained server + traced `node_modules`)
  - `.next/static` → `.next/static`
  - `public/`
  - `db/migrations/*.sql` and `db/seed.sql` — **not** traced automatically by
    Next's build since they're read via `fs` at runtime, not imported; must be
    copied explicitly or the auto-migration in `src/lib/db.ts` will find
    nothing to apply.
  - Creates `/app/data`, `chown`s it to a non-root `node` user, `USER node`.
  - `CMD ["node", "server.js"]`, `EXPOSE 3000`.
  - `HEALTHCHECK` hitting `http://localhost:3000/`.

### 3. `docker-compose.yml` (prod)
- Builds the `prod` target.
- Port `3000:3000`.
- Named volume `radio-data:/app/data`.
- Env: `NODE_ENV=production`, `DATABASE_PATH=/app/data/app.db`.
- `restart: unless-stopped`.

### 4. `docker-compose.dev.yml` (dev)
- Builds the `dev` target.
- Bind mount `.:/app`, plus **anonymous volumes** for `/app/node_modules` and
  `/app/.next` so the container's Linux-built `node_modules` (some deps ship
  platform-specific native binaries) aren't shadowed by the Windows host's copy.
- Bind mount `./data:/app/data` (keeps the existing local convention of an
  inspectable `./data/app.db` on disk).
- Port `3000:3000`.
- Env: `DATABASE_PATH=/app/data/app.db`.

### 5. `.dockerignore`
Excludes `node_modules`, `.next`, `data`, `.git`, `*.md` (except keep
`README.md` if referenced by anything — actually not needed at runtime, will
exclude), coverage, `.env*`.

## Out of scope / not changing
- No changes to app code, ratings logic, or the stream/player.
- No `.env` file introduced — the only two env vars the app reads
  (`DATABASE_PATH`, `NODE_ENV`) are set directly in the compose files.
- Migrations continue to run automatically on first DB connection (existing
  behavior in `src/lib/db.ts`); no separate migration entrypoint step is added.
- `npm run db:migrate` / `db:seed` / `db:query` CLI scripts are dev-only
  conveniences (they need `scripts/`, full `node_modules`, and TS source) and
  won't work inside the slim prod image — only intended to run via
  `docker compose -f docker-compose.dev.yml run` or locally.

## Docs to update after implementation
Per `AGENTS.md`/`CLAUDE.md`: update `README.md` with Docker run instructions,
and add a short note to `AGENTS.md` about the standalone build output if it
affects any conventions.

## Commands (once built)
- Dev: `docker compose -f docker-compose.dev.yml up --build`
- Prod: `docker compose up --build -d`
