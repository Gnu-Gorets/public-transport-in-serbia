# Project guidance

1. Node.js 26 app: Fastify API in `server/`, browser UI in `static/`, Vitest tests in `tests/`.
2. Keep changes within existing layers: routes and validation in `server/routes/`, provider/cache and business logic in `server/services/`, response mapping in `server/transforms.js`, UI behavior in `static/script.js`.
3. Provider integrations are external and may fail or change shape. Preserve input validation, upstream error handling, timeouts, and stale station-cache behavior; cover response and failure cases in tests.
4. Keep API schemas in sync with route behavior and UI callers. Use `npm test` for verification; CI runs the same command. Provider calls are mocked, so passing tests do not verify live upstream compatibility.
5. Provider settings load from `server/apikeys.json`; deployment environment variables override supported keys in `server/config.js`. Never print, expose, or casually replace credential values; use environment overrides for deployment changes.
6. Runtime serves `static/` and listens on port 3000. Keep Docker runtime file copies and dependency installation aligned with application changes.
