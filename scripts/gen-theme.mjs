import { mkdir, writeFile } from "node:fs/promises";
import { Hct, SchemeTonalSpot } from "@ktibow/material-color-utilities-nightly";
import { colors } from "m3-svelte/etc/colors";

const source = Hct.from(176.5, 36, 50);
const light = new SchemeTonalSpot(source, false, 0);
const dark = new SchemeTonalSpot(source, true, 0);
const hex = (argb) => `#${(argb & 0xffffff).toString(16).padStart(6, "0")}`;
const variables = (scheme, indent = "    ") =>
  colors
    .map(
      (color) =>
        `${indent}--m3c-${color.name.replaceAll("_", "-")}: ${hex(color.getArgb(scheme))};`,
    )
    .join("\n");
const tokens = [
  `  :root {\n    color-scheme: light;\n${variables(light)}\n  }`,
  `  @media (prefers-color-scheme: dark) {\n    :root:not([data-theme="light"]) {\n      color-scheme: dark;\n${variables(dark, "      ")}\n    }\n  }`,
  `  :root[data-theme="dark"] {\n    color-scheme: dark;\n${variables(dark)}\n  }`,
  `  :root[data-theme="light"] {\n    color-scheme: light;\n  }`,
].join("\n\n");

// Keep generated ESM scoped without changing root package module mode.
await mkdir(new URL("../.svelte-kit/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../.svelte-kit/package.json", import.meta.url),
  '{"type":"module"}\n',
);
await writeFile(
  new URL("../src/theme.css", import.meta.url),
  `@function --m3-density(--size) {\n  result: var(--size);\n}\n\n@layer tokens {\n${tokens}\n\n  :root {\n    --m3-shape-none: 0;\n    --m3-shape-extra-small: 4px;\n    --m3-shape-small: 8px;\n    --m3-shape-medium: 12px;\n    --m3-shape-large: 16px;\n    --m3-shape-extra-large: 28px;\n    --m3-shape-full: 9999px;\n    --m3-font: "Roboto Variable", Roboto, system-ui, sans-serif;\n  }\n}\n`,
);
