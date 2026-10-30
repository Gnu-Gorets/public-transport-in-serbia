# Public transport in Serbia

## Requirements

Node.js 26 and npm are required for local development and production builds.

## Local development

### Dockerless

1. Run `npm ci` in project root.
2. Run `npm run dev`.
3. Open http://127.0.0.1:3000.

`npm run dev` runs Fastify API on port 3001 and Vite development server on port 3000; Vite proxies API requests to Fastify. Production uses one Fastify process for API and built UI on port 3000. Build and run it locally with `npm run build` followed by `npm start`.

### Docker

Build and start an image from current checkout:

```sh
docker build -f Dockerfile_local -t public-transport-in-serbia .
docker run --name public-transport-in-serbia -p 3000:3000 public-transport-in-serbia
```

To build an image from the latest GitHub `main` source, use `Dockerfile`:

```sh
docker build -f Dockerfile -t public-transport-in-serbia .
docker run --name public-transport-in-serbia -p 3000:3000 public-transport-in-serbia
```

## Configuration, push, and persistent data

Set active provider credentials with `NS_KEY`, `NS_URL`, `NIS_KEY`, and `NIS_URL`; environment values override corresponding values in `be/server/apikeys.json`. Belgrade (`BG_*`) configuration is currently filtered out because its provider API is unavailable, so those overrides have no effect. Do not put secrets in source control or image layers; supply them at runtime through your deployment platform.

Web push is enabled when all three variables are supplied: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Public key is exposed to clients; keep private key secret. Push subscriptions are stored in `data/alerts.json` under working directory by default. Set `ALERTS_DATA_DIR` to use a different directory. Mount persistent storage there, or at `/app/data` when using supplied Docker images, so subscriptions survive container replacement. For example:

```sh
docker run --name public-transport-in-serbia -p 3000:3000 \
  -v public-transport-data:/app/data \
  -e VAPID_PUBLIC_KEY -e VAPID_PRIVATE_KEY -e VAPID_SUBJECT \
  public-transport-in-serbia
```

Run `npm run verify` before deployment to check types, lint, formatting, tests, and production build.

## Credits

Inspired by [BG++](https://github.com/MikMik1011/bgpp).
