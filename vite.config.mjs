import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { functionsMixins } from "vite-plugin-functions-mixins";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      files: {
        assets: "fe/static",
        routes: "fe/src/routes",
        appTemplate: "fe/src/app.html",
      },
    }),
    functionsMixins({ deps: ["m3-svelte"] }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
