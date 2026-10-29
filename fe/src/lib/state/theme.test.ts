// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyAccentStyles, applyTheme } from "./theme.ts";

afterEach(() => {
  document.head.replaceChildren();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

describe("theme helpers", () => {
  it("reuses the accent stylesheet element when accent changes", () => {
    applyAccentStyles("bgpp-teal", "system");
    const style = document.getElementById("dynamic-accent");
    const defaultStyles = style?.textContent;

    applyAccentStyles({ hue: 240 }, "dark");

    expect(document.querySelectorAll("#dynamic-accent")).toHaveLength(1);
    expect(style?.textContent).not.toBe(defaultStyles);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("clears explicit theme when following system preference", () => {
    applyTheme("dark");
    applyTheme("system");

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe("light dark");
  });
});
