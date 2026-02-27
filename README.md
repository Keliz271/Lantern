# Lantern

Real-time SvelteKit control panel for homelab/service monitoring with a visual editor, SSE live updates, and multi-node support.

## What it does

- Renders widgets from persisted config (`config/widgets.json` by default).
- Streams runtime updates over SSE (`/api/stream`).
- Polls external services server-side and caches normalized runtime state.
- Provides a full editor at `/editor` for layout, style, data sources, and widget options.
- Supports background image uploads and secure media image proxying for Plex/Jellyfin assets.

## Stack

- SvelteKit + Svelte 5 + TypeScript
- Node runtime via `@sveltejs/adapter-node`
- JSON-backed config persistence + in-memory runtime cache

## Quick start (local)

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Production build

```bash
npm run check
npm run build
npm run preview
```

## Backup/restore drill

Run a non-destructive backup + restore verification:

```bash
npm run backup:drill
```

This writes a timestamped backup under `./backups` (or `LANTERN_BACKUP_DIR`) and verifies restore into a temporary directory.

## Docker

This repository includes `Dockerfile` and `compose.example.yaml`.

### Run with Compose

```bash
cp compose.example.yaml compose.yaml
docker compose up -d --build
```

Default public compose mapping publishes container `3000` on host `3000`.
Open `http://<host>:3000`.

### Persistent mounts (compose)

- Host `./config/widgets.json` -> Container `/config/widgets.json`
- Host `./static/uploads` -> Container `/app/static/uploads`

The image bakes in `LANTERN_CONFIG_PATH=/config/widgets.json` (along with `NODE_ENV=production`, `HOST=0.0.0.0`, and `PORT=3000`), so compose does not need to repeat them.

### Resource guardrails

The compose template includes an optional guardrail block you can enable:

- CPU/memory/pids limits
- `restart: unless-stopped`
- JSON-file log rotation (`max-size` + `max-file`)
- Container healthcheck (`/api/widgets`)

These are provided as optional commented settings directly in `compose.example.yaml`.

### OOM/restart alerting

Run host-side Docker event monitoring:

```bash
npm run ops:watch-docker-events
```

It watches container `oom`, `die` (OOM-like), and `restart` events for `LANTERN_ALERT_CONTAINER` and emits structured JSON logs.  
Set `LANTERN_ALERT_WEBHOOK_URL` to forward alerts to Slack/Discord/webhook endpoints.

## Project structure

- `src/routes/+page.svelte` — runtime Lantern UI
- `src/routes/editor/+page.svelte` — visual editor
- `src/routes/api/*/+server.ts` — API handlers
- `src/lib/server/state.ts` — runtime refresh/cache orchestration
- `src/lib/server/stream.ts` — SSE subscriber/broadcast layer
- `src/lib/server/connectors/*.ts` — service integrations
- `src/lib/widgets/types.ts` / `src/lib/widgets/registry.ts` — widget contracts/registry
- `config/widgets.json` — persisted Lantern config
- `static/uploads` — uploaded background assets

## Runtime flow

1. Config is loaded from disk and normalized.
2. `state.ts` refreshes widget data on schedule.
3. Runtime snapshot is cached in memory.
4. Updates broadcast to connected clients via SSE.
5. Lantern and editor consume current runtime snapshot.

## API

- `GET /api/widgets` — runtime widgets/settings snapshot (from runtime cache + disk refresh fallback)
- `GET /api/config` — sanitized persisted config snapshot
- `POST /api/config` — save config + refresh runtime state (serialized write lock)
- `GET /api/stream` — SSE stream (`widgets` events + heartbeat)
- `POST /api/background` — upload PNG/JPEG/GIF/WebP background into uploads directory
- `POST /api/monitor-test` — test one monitor target URL/container health
- `POST /api/health-test` — test container health + optional base URL reachability
- `GET /api/media-image` — proxy allowlisted Plex/Jellyfin image paths for media widgets

If basic auth is configured, all routes (except `OPTIONS`) require valid credentials.

## Widgets

Supported `WidgetKind` values:

- `stat`
- `chart`
- `service`
- `prowlarr`
- `sabnzbd`
- `speedtest`
- `grafana`
- `monitor`
- `systemMonitor`
- `calendar`
- `clock`
- `requests`
- `plex`
- `history` (legacy media mode)

Primary integrations used across widgets:

- Komodo, Technitium, Radarr/Sonarr/Readarr, Prowlarr, Profilarr
- SABnzbd, qBittorrent
- Home Assistant, Scrutiny, Tandoor
- Speedtest Tracker
- Seerr (summary + requests)
- Plex / Jellyfin
- Grafana panel embedding
- Generic endpoint monitor + Glances-backed system monitor

## System monitor (Glances)

- Uses Glances HTTP API per selected node (default `http://<node>:61208`).
- Supports both Glances v3 and v4 endpoint formats for compatibility.
- Probes only endpoints required by enabled metrics to reduce request volume.
- Falls back between v4/v3 as needed per node/endpoint and caches successful API version where possible.

## Configuration and persistence

- Source of truth: `config/widgets.json` (or `LANTERN_CONFIG_PATH`).
- Runtime-only widget fields are stripped before persistence.
- Secrets in widget options are redacted from client snapshots.
- Missing incoming secret fields are merged from stored values on config updates.

## Security behavior

- Optional HTTP Basic auth via env variables.
- Optional request host allowlist enforcement is available for public deployments.
- Optional CSRF origin validation is available for mutating API routes.
- Probe URL validation restricts protocol to HTTP(S), blocks local/metadata ranges, and enforces host allowlist rules.
- Upload endpoint enforces content length, file-size, storage quota, and magic-byte type checks.
- Media image proxy only allows strict Plex/Jellyfin asset path patterns and request key allowlists.
- Config write path is serialized to avoid concurrent write corruption.

## Observability

- JSON structured request logs are emitted from `hooks.server.ts`.
- Every response includes `x-request-id` for trace correlation.
- Unhandled server errors are captured and sent to Sentry when configured.
- High-volume paths can be suppressed/sampled to keep logs useful.

## Environment variables

Runtime supports both `LANTERN_*` and legacy `DASHBOARD_*` variable names, with `LANTERN_*` taking precedence.

### Core runtime

- `LANTERN_CONFIG_PATH` — config file path override.
- `PUBLIC_EXECUTION_NODES` — node list (`id|Label|host,...`) used in UI/runtime.
- `DOCKER_SERVERS` — docker API endpoints (`name=http://host:2375,...`).
- `DOCKER_DEFAULT_SERVER` — default server key from `DOCKER_SERVERS`.

### Optional auth

- `LANTERN_AUTH_USER`
- `LANTERN_AUTH_PASSWORD`
- `LANTERN_ALLOWED_HOSTS` — optional comma-separated request host allowlist (`example.com,*.example.com`).
- `LANTERN_CSRF_ORIGIN_CHECK_ENABLED` — enables origin/referer checks for mutating API routes.
- `LANTERN_CSRF_ALLOWED_ORIGINS` — explicit comma-separated allowed origins (`https://lantern.example.com`).
- `LANTERN_CSRF_ALLOW_MISSING_ORIGIN` — allows mutating requests with no origin/referer when CSRF checks are enabled.

### Probe/test controls

- `LANTERN_ALLOWED_PROBE_HOSTS` — explicit comma-separated host allowlist.
- `LANTERN_ALLOW_UNLISTED_PROBE_HOSTS` — `true` to allow non-listed public hosts.
- `LANTERN_MAX_TEST_BODY_KB` — max body size for monitor/health test endpoints.

### Config/upload limits

- `LANTERN_MAX_CONFIG_MB` — max `POST /api/config` payload size.
- `LANTERN_UPLOADS_PATH` — uploads directory override.
- `LANTERN_MAX_UPLOAD_MB` — max single uploaded file size.
- `LANTERN_MAX_UPLOAD_BODY_MB` — max upload request body size.
- `LANTERN_MAX_UPLOAD_STORAGE_MB` — total managed upload storage quota.
- `LANTERN_DISK_REFRESH_MIN_MS` — min interval for disk refresh guard.
- `LANTERN_BACKUP_DIR` — backup output directory for `npm run backup:drill`.

### Container guardrails (compose keys)

- `init`
- `stop_grace_period`
- `mem_limit`
- `mem_reservation`
- `cpus`
- `pids_limit`
- `logging` (`json-file`, `max-size`, `max-file`)
- `healthcheck` (`test`, `interval`, `timeout`, `retries`, `start_period`)

### OOM/restart alert watcher (host-side)

- `LANTERN_ALERT_CONTAINER` — container name to watch.
- `LANTERN_ALERT_WEBHOOK_URL` — optional webhook destination.
- `LANTERN_ALERT_COOLDOWN_SEC` — dedupe window for repeated alert events.

### Observability

- `LANTERN_LOG_LEVEL` — structured log level (`debug`, `info`, `warn`, `error`).
- `LANTERN_LOG_QUIET_PATHS` — comma-separated request paths to suppress from normal request logs.
- `LANTERN_LOG_REQUEST_SAMPLE_RATE` — sample rate for non-quiet successful request logs (`0` to `1`).
- `LANTERN_SENTRY_DSN` — enables Sentry error tracking when set.
- `LANTERN_SENTRY_ENVIRONMENT` — environment tag sent to Sentry.
- `LANTERN_SENTRY_RELEASE` — release identifier sent to Sentry.
- `LANTERN_SENTRY_TRACES_SAMPLE_RATE` — Sentry performance sampling rate (`0` to `1`).

### Service integrations

- `KOMODO_URL`, `KOMODO_API_KEY`, `KOMODO_API_SECRET`
- `TECHNITIUM_URL`, `TECHNITIUM_TOKEN`, `TECHNITIUM_TIMEFRAME`
- `RADARR_URL`, `RADARR_API_KEY`
- `SONARR_URL`, `SONARR_API_KEY`
- `READARR_URL`, `READARR_API_KEY`
- `PROWLARR_URL`, `PROWLARR_API_KEY`
- `PROFILARR_URL`, `PROFILARR_API_KEY`
- `SABNZBD_URL`, `SABNZBD_API_KEY`
- `QBITTORRENT_URL`, `QBITTORRENT_USERNAME`, `QBITTORRENT_PASSWORD`
- `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`
- `SCRUTINY_URL`, `SCRUTINY_API_KEY`
- `TANDOOR_URL`, `TANDOOR_API_KEY`
- `SPEEDTEST_TRACKER_URL`, `SPEEDTEST_TRACKER_API_KEY`
- `GRAFANA_URL`
- `AUDIOBOOKSHELF_URL`, `AUDIOBOOKSHELF_API_KEY`
- `PLEX_URL`, `PLEX_TOKEN`
- `JELLYFIN_URL`, `JELLYFIN_TOKEN`, `JELLYFIN_USER`
- `SEERR_URL`, `SEERR_API_KEY`

Use `.env.example` as the baseline template.

## Notes for contributors

- Keep API logic in `src/routes/api/*/+server.ts` and heavy orchestration in `src/lib/server/*`.
- Add new connectors in `src/lib/server/connectors/`.
- Update widget types/registry/renderer/editor together when adding new widget kinds.
- Run `npm run check` and `npm run build` before shipping runtime/server changes.
