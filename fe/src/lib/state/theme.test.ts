// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyAccentStyles, applyTheme } from "./theme.ts";

afterEach(() => {
  document.head.replaceChildren();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

describe("theme helpers", () => {
  it("applies the fixed accent and selected color scheme", () => {
    applyAccentStyles("dark");
    const style = document.getElementById("dynamic-accent");

    expect(style?.textContent).toContain("--m3c-primary");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    applyAccentStyles("system");
    expect(document.querySelectorAll("#dynamic-accent")).toHaveLength(1);
  });

  it("clears explicit theme when following system preference", () => {
    applyTheme("dark");
    applyTheme("system");

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe("light dark");
  });
});
