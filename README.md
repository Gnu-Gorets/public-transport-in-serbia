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

Build and start local image from current checkout:

```sh
docker build -f Dockerfile_local -t public-transport-in-serbia .
docker run --name public-transport-in-serbia -p 3000:3000 public-transport-in-serbia
```

To build from latest GitHub `main` source, use `Dockerfile`:

```sh
docker build -f Dockerfile -t public-transport-in-serbia .
docker run --name public-transport-in-serbia -p 3000:3000 public-transport-in-serbia
```

## Credits

Inspired by [BG++](https://github.com/MikMik1011/bgpp).
