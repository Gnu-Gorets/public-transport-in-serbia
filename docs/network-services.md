# Network services

Application contacts following external services. This inventory covers destinations found in source code. Upstream redirects may lead elsewhere.

## Runtime services

### Transit data

| Domain                                | Purpose                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `online.nsmart.rs`                    | NS provider: station catalog at startup, refreshed after cache expiry; arrivals and timetables on demand.                   |
| `online.jgpnis.rs`                    | NIS provider: station catalog, arrivals, and timetables.                                                                    |
| `yandex.com`                          | Belgrade stops, routes, and vehicle positions; pages load on cache misses.                                                  |
| `announcement-bgnaplata.ticketing.rs` | Belgrade ticketing API, configured but inactive. `be/server/config.js` excludes `bg`; Belgrade transit requests use Yandex. |

Provider base URLs live in `be/server/apikeys.json`. `NS_URL` and `NIS_URL` environment variables can override active provider URLs. Provider requests also use credentials from configuration. This document omits credential values.

### Routes and maps

| Domain                           | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `router.project-osrm.org`        | OSRM routing service, called when client requests `/api/route`.      |
| `{a,b,c}.tile.openstreetmap.org` | Browser loads map tiles through Leaflet on map view and pan or zoom. |

### Push notifications

Browser creates push subscription through `PushManager.subscribe`, which returns HTTPS endpoint for browser's push service. Browser sends subscription to application backend through `/api/v2/alerts`.

When alert matches, backend uses `web-push` to send notification to that endpoint. This server request delivers notification while browser is closed. Endpoint hostname depends on browser and push provider, so source does not define one fixed domain.

## Same origin and local requests

- Browser API calls use relative `/api/...` paths and go to origin serving application. These include station and route data, alert evaluation, and push alert management.
- Browser registers `/service-worker.js` from same origin. Service worker does not fetch remote resources.
- During server side rendering, `fe/src/routes/+page.server.ts` calls local Fastify API at `http://127.0.0.1:<port>`. Port is `3001` in development and `PORT` (default `3000`) in production. This is loopback traffic, not external service traffic.

## Build and install services

These destinations are used during image builds or dependency installation, not during normal application runtime:

- `github.com`: `Dockerfile` clones repository `main` branch.
- `docker.io`: Docker downloads `node:26-alpine` base image.
- npm package registry: pnpm downloads JavaScript dependencies during image builds and local installation.

## Source locations

- Provider configuration and overrides: `be/server/apikeys.json`, `be/server/config.js`
- Provider requests and station cache: `be/server/services/providerService.js`
- Belgrade integration: `be/server/services/yandexBelgradeService.js`
- OSRM requests: `be/server/services/routeService.js`
- Web Push delivery: `be/server/services/alertsService.js`
- Map tiles: `fe/src/lib/components/map/StationMap.svelte`
- Browser API calls: `fe/src/lib/api.ts`, `fe/src/lib/state/`
- Server side API calls: `fe/src/routes/+page.server.ts`
