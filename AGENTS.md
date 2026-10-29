# Project guidance

1. Node.js 26 app: Fastify API in `be/server/`, SvelteKit browser UI in `fe/src/`, Vitest tests in `tests/`.
2. Keep changes within existing layers: routes and validation in `be/server/routes/`, provider/cache and business logic in `be/server/services/`, response mapping in `be/server/transforms.js`, UI behavior in `fe/src/routes/` and `fe/src/lib/`.
3. Provider integrations are external and may fail or change shape. Preserve input validation, upstream error handling, timeouts, and stale station-cache behavior; cover response and failure cases in tests.
4. Keep API schemas in sync with route behavior and UI callers. Before committing, run `npm run lint`, `npm run format:check`, and `npm test`; CI runs the same checks. Provider calls are mocked, so passing tests do not verify live upstream compatibility.
5. Provider settings load from `be/server/apikeys.json`; deployment environment variables override supported keys in `be/server/config.js`. Never print, expose, or casually replace credential values; use environment overrides for deployment changes.
6. Production serves the built SvelteKit app through Fastify and listens on port 3000. Keep Docker build inputs and runtime assets (including `fe/static/service-worker.js` and `fe/static/favicon.png`) aligned with application changes.
