import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "server/data/**"],
  },
  js.configs.recommended,
  {
    files: ["server/**/*.js", "tests/**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["static/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        $: "readonly",
        L: "readonly",
        changeBg: "readonly",
        mapLayers: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^(mapLayers|onNameChange|onRangeChange)$",
        },
      ],
    },
  },
];
