import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "node_modules/**",
      "server/data/**",
      ".svelte-kit/**",
      "build/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^selectCity$" },
      ],
      "svelte/no-navigation-without-resolve": "off",
      "svelte/prefer-svelte-reactivity": "off",
    },
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".svelte"],
      },
    },
  },
  {
    files: ["server/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["server/**/*.js", "tests/**/*.{js,ts}", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["static/service-worker.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["src/**/*.{js,ts,svelte}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
