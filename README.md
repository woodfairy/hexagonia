# Hexagonia

Monorepo for a browser-based, real-time, Catan-like strategy game with:

- `apps/server`: Fastify + WebSocket backend with PostgreSQL persistence
- `apps/web`: React + Three.js frontend
- `packages/shared`: shared protocol, domain types and helpers
- `packages/rules`: server-authoritative base-game rules engine

## Development

1. Install Node.js 20+ and `pnpm`.
2. Copy `.env.example` to `.env`.
3. Start PostgreSQL with `docker compose up postgres -d`.
4. Install dependencies with `pnpm install`.
5. Start the backend with `pnpm dev:server`.
6. Start the frontend in a second terminal with `pnpm dev:web`.

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

The web client uses same-origin `/api` and `/ws` endpoints by default. In Docker, the published web image serves the built app via Nginx on port `4173` and proxies API and WebSocket traffic internally to the server container, which avoids browser CORS issues behind HTTPS reverse proxies.

## Scope

The current implementation establishes the full architecture and a functional base-game core:

- username/password auth with secure cookie sessions
- private rooms with seating and ready states
- server-authoritative match state via WebSockets
- seeded base-board generation, setup rounds, robber, building, development cards and scoring
- modern React shell with a Three.js tabletop board and responsive HUD

Further production hardening, content polish and expansion rules can extend the existing module boundaries without reshaping the core.
