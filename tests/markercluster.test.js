import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";

let dom;

afterEach(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});

it("adds marker clustering to Leaflet default export", async () => {
  dom = new JSDOM("<!doctype html>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("Element", dom.window.Element);
  vi.stubGlobal("SVGElement", dom.window.SVGElement);

  const leaflet = await import("leaflet");
  vi.stubGlobal("L", leaflet.default);
  await import("leaflet.markercluster");

  expect(typeof leaflet.default.markerClusterGroup).toBe("function");
});
