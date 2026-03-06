# Hexagonia

Monorepo for a browser-based, real-time, Catan-like strategy game with:

- `apps/server`: Fastify + WebSocket backend with PostgreSQL persistence
- `apps/web`: React + Three.js frontend
- `packages/shared`: shared protocol, domain types and helpers
- `packages/rules`: server-authoritative base-game rules engine

## Development

1. Install Node.js 20+ and `npm`.
2. Copy `.env.example` to `.env`.
3. Start PostgreSQL with `docker compose up postgres -d`.
4. Install dependencies with `npm install`.
5. Start the backend with `npm run dev:server`.
6. Start the frontend in a second terminal with `npm run dev:web`.

## Docker

`docker-compose.yml` is configured to pull prebuilt images from GHCR by default:

- `ghcr.io/woodfairy/hexagonia-server`
- `ghcr.io/woodfairy/hexagonia-web`

The published GHCR images are multi-arch and target both `linux/amd64` and `linux/arm64`, so they run on standard x86 hosts as well as Apple Silicon and ARM servers.

You can override the image owner and tag in `.env`:

- `GHCR_OWNER`
- `IMAGE_TAG`

Typical startup:

1. Copy `.env.example` to `.env`.
2. If the GHCR packages are private, run `docker login ghcr.io`.
3. Run `docker compose pull`.
4. Run `docker compose up -d`.

The web client defaults to talking to the same host on port `3000`, so a standard local deployment works without rebuilding the frontend image. The published web image serves the built app as static files via Nginx on port `4173`.

## Scope

The current implementation establishes the full architecture and a functional base-game core:

- email/password auth with secure cookie sessions
- private rooms with seating and ready states
- server-authoritative match state via WebSockets
- seeded base-board generation, setup rounds, robber, building, development cards and scoring
- modern React shell with a Three.js tabletop board and responsive HUD

Further production hardening, content polish and expansion rules can extend the existing module boundaries without reshaping the core.
