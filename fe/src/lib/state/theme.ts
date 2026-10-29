import { Hct, SchemeTonalSpot } from "@ktibow/material-color-utilities-nightly";
import { colors, genCSS } from "m3-svelte/etc/colors";
import type { Accent } from "./preferences.ts";

export function applyTheme(theme: string) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "system" ? "light dark" : theme;
}

export function applyAccentStyles(accent: Accent, theme: string) {
  const hue =
    typeof accent === "object"
      ? accent.hue
      : accent === "device-blue"
        ? 200
        : 176.5;
  const source = Hct.from(hue, 36, 50);
  const stylesheet = genCSS(
    new SchemeTonalSpot(source, false, 0),
    new SchemeTonalSpot(source, true, 0),
    colors,
  );
  let style = document.getElementById(
    "dynamic-accent",
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "dynamic-accent";
    document.head.append(style);
  }
  style.textContent = stylesheet;
  document.documentElement.style.colorScheme =
    theme === "system" ? "light dark" : theme;
}
