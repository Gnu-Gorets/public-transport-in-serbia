import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const scriptPath = resolve("static/script.js");

const createMarker = () => ({
  bindPopup(text) {
    this.popup = text;
    return this;
  },
  bindTooltip(text) {
    this.tooltip = text;
    return this;
  },
  on() {
    return this;
  },
});

function loadUiScript(runReady = false, initialAjax) {
  const dom = new JSDOM(
    `<!doctype html>
    <body>
      <select id="city"><option value="bg">Belgrade</option><option value="ns">Novi Sad</option><option value="nis">Nis</option></select>
      <div id="stationControls">
        <select id="searchMode"><option value="name">Name</option><option value="coords">Coords</option></select>
        <div class="name-search"><input id="name-input" /><div id="dropdown"></div></div>
        <div class="coords-search"></div>
      </div>
      <input id="submit" />
      <input id="stationsMaxDistance-input" value="350" />
      <select id="coords-input"></select>
      <div class="name-search"></div>
      <div class="coords-search"></div>
      <p id="updateInProgress"></p>
      <p id="stationName"></p>
      <p id="lastUpdated"></p>
      <p id="busRouteInfo"></p>
      <p id="error"></p>
      <div id="noBusesMessage"></div>
      <div id="tableContainer"></div>
      <table id="tabela" style="display:none"><thead id="thead"><tr><th>#</th><th>ETA</th><th>Route</th></tr></thead><tbody id="tableBody"></tbody></table>
      <div id="scheduleSection"></div>
      <p id="scheduleInfo"></p>
      <div id="scheduleContainer"></div>
      <div id="map"></div>
    </body>`,
    {
      url: "http://localhost/",
      runScripts: "outside-only",
    },
  );

  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  global.localStorage = dom.window.localStorage;

  delete require.cache[require.resolve("jquery")];
  const $ = require("jquery");
  let readyCallback;
  let readyPromise;
  $.fn.ready = function ready(callback) {
    if (runReady) readyCallback = callback;
    return this;
  };

  const map = {
    setView: vi.fn(),
    fitBounds: vi.fn(),
  };
  const layerGroup = {
    clearLayers: vi.fn(),
    removeLayer: vi.fn(),
  };

  dom.window.$ = $;
  dom.window.jQuery = $;
  dom.window.changeBg = vi.fn();
  dom.window.console = console;
  dom.window.fetch = vi.fn();
  dom.window.L = {
    Icon: function Icon() {},
    marker: function marker() {
      return createMarker();
    },
    featureGroup: vi.fn(function featureGroup() {
      return {
        addTo() {
          return this;
        },
        getBounds() {
          return "bounds";
        },
      };
    }),
    polyline: vi.fn(() => ({
      addTo() {
        return this;
      },
      getBounds() {
        return "route-bounds";
      },
    })),
    geoJSON: vi.fn(() => ({
      addTo() {
        return this;
      },
    })),
    map: vi.fn(() => ({ setView: vi.fn() })),
    layerGroup: vi.fn(() => ({
      addTo() {
        return this;
      },
      clearLayers: vi.fn(),
    })),
    control: { layers: vi.fn(() => ({ addTo: vi.fn() })) },
  };

  const source = `const mapLayers = { Transport: { addTo() {} } };
    ${readFileSync(scriptPath, "utf8")}
    window.__ui = {
      fetchSchedule,
      fetchCityStations,
      fetchArrivals,
      searchByCoords,
      findClosestStations,
      formatSeconds,
      cancelInterval,
      onCityChange,
      onSearchModeChange,
      submitByName,
      fetchBgStop,
      showBgRoute,
      updateArrivals,
      updateBgArrivals,
      setStations(city, stations) {
        allStations[city] = stations;
      },
      getStations(city) {
        return allStations[city];
      },
      setQuery(query) {
        currQuery = query;
      },
      setLines(city, lines) {
        allLines[city] = lines;
      },
      addRouteToMap,
      setMapStubs(nextMap, nextLayerGroup) {
        map = nextMap;
        layerGroup = nextLayerGroup;
      }
    };
  `;

  vm.runInContext(source, dom.getInternalVMContext());
  dom.window.__ui.setMapStubs(map, layerGroup);
  if (runReady) {
    $.ajax =
      initialAjax ||
      vi.fn().mockResolvedValue({ bg: "Belgrade", ns: "Novi Sad" });
    readyPromise = readyCallback();
  }

  return { dom, $, map, layerGroup, ui: dom.window.__ui, readyPromise };
}

describe("UI behavior", () => {
  let context;

  beforeEach(() => {
    vi.restoreAllMocks();
    context = loadUiScript();
  });

  afterEach(() => context.ui.cancelInterval());

  it("loads Belgrade catalog on dropdown focus, not city change", async () => {
    const readyContext = loadUiScript(true);
    context = readyContext;
    readyContext.$.ajax = vi.fn(({ url }) => {
      if (url === "/api/cities")
        return Promise.resolve({ ns: "Novi Sad", bg: "Belgrade" });
      if (url === "/api/bg/stops")
        return Promise.resolve({ stops: [{ id: "123", name: "Stop" }] });
      return Promise.resolve([]);
    });
    await readyContext.readyPromise;
    readyContext.dom.window.document.getElementById("city").value = "bg";
    await readyContext.ui.onCityChange();
    expect(readyContext.$.ajax).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: "/api/bg/stops" }),
    );
    readyContext.dom.window.document
      .getElementById("name-input")
      .dispatchEvent(new readyContext.dom.window.Event("focus"));
    await vi.waitFor(() =>
      expect(readyContext.ui.getStations("bg")).toEqual([
        { id: "123", name: "Stop", uid: "123" },
      ]),
    );
    expect(readyContext.$.ajax).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/api/bg/stops" }),
    );
  });

  it("keeps failed BG catalog load cached as empty for later focus", async () => {
    const readyContext = loadUiScript(true);
    context = readyContext;
    vi.spyOn(console, "error").mockImplementation(() => {});
    readyContext.$.ajax = vi.fn(({ url }) => {
      if (url === "/api/cities")
        return Promise.resolve({ ns: "Novi Sad", bg: "Belgrade" });
      if (url === "/api/bg/stops") return Promise.reject(new Error("offline"));
      return Promise.resolve([]);
    });
    await readyContext.readyPromise;
    const input = readyContext.dom.window.document.getElementById("name-input");
    readyContext.dom.window.document.getElementById("city").value = "bg";
    input.dispatchEvent(new readyContext.dom.window.Event("focus"));
    await vi.waitFor(() =>
      expect(readyContext.$.ajax).toHaveBeenCalledWith(
        expect.objectContaining({ url: "/api/bg/stops" }),
      ),
    );
    await vi.waitFor(() =>
      expect(readyContext.ui.getStations("bg")).toEqual([]),
    );
    input.dispatchEvent(new readyContext.dom.window.Event("focus"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(
      readyContext.$.ajax.mock.calls.filter(
        ([{ url }]) => url === "/api/bg/stops",
      ),
    ).toHaveLength(1);
  });

  it("retries failed NS catalog loads while leaving station cache unset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = vi.fn(({ url }) => {
      if (url === "/api/cities")
        return Promise.resolve({ ns: "Novi Sad", bg: "Belgrade" });
      return Promise.reject(new Error("offline"));
    });
    const readyContext = loadUiScript(true, request);
    context = readyContext;
    await readyContext.readyPromise;
    expect(readyContext.ui.getStations("ns")).toBeUndefined();
    readyContext.dom.window.document
      .getElementById("name-input")
      .dispatchEvent(new readyContext.dom.window.Event("focus"));
    await vi.waitFor(() =>
      expect(
        request.mock.calls.filter(
          ([{ url }]) => url === "/api/stations/ns/all",
        ),
      ).toHaveLength(2),
    );
    expect(readyContext.ui.getStations("ns")).toBeUndefined();
  });

  it("loads Belgrade catalog through shared station loader", async () => {
    const { $, ui } = context;
    vi.spyOn($, "ajax").mockResolvedValue({
      stops: [{ id: "123", name: "Stop" }],
    });
    await ui.fetchCityStations("bg");
    expect(ui.getStations("bg")).toEqual([
      { id: "123", name: "Stop", uid: "123" },
    ]);
  });

  it("uses native Leaflet map without Yandex iframe or link", () => {
    const html = readFileSync(resolve("static/index.html"), "utf8");
    expect(html).toContain('<div id="map"></div>');
    expect(html).not.toContain("bgYandexMap");
    expect(html).not.toContain("bgTransportLink");
    expect(html).not.toContain("yandex.com/map-widget");
  });

  it("requires explicit BG stop selection and restores controls for NS", async () => {
    const { $, dom, map, ui } = context;
    const timer = vi.spyOn(dom.window, "setInterval");
    const request = vi.spyOn($, "ajax").mockResolvedValue({
      city: "bg",
      name: "Stadion Partizan · 278",
      uid: "6739029064",
      id: "6739029064",
      coords: [44.786, 20.4577],
      arrivals: [
        {
          lineNumber: "40",
          destination: "Zvezdara",
          scheduledAt: new Date(Date.now() + 120_000).toISOString(),
          estimatedAt: new Date(Date.now() + 120_000).toISOString(),
          isEstimated: true,
        },
        {
          lineNumber: "41",
          destination: "Studentski trg",
          scheduledAt: new Date(Date.now() + 300_000).toISOString(),
          estimatedAt: null,
          isEstimated: false,
        },
      ],
    });
    $("#city").val("bg");

    await ui.onCityChange();

    expect(request).not.toHaveBeenCalled();
    expect(timer).not.toHaveBeenCalled();
    expect($("#stationName").css("display")).toBe("none");
    expect($("#tableContainer").css("display")).toBe("none");
    expect(dom.window.L.featureGroup).not.toHaveBeenCalled();
    expect($("#map").css("display")).not.toBe("none");
    expect($("#stationControls").css("display")).not.toBe("none");
    expect($("#searchMode").val()).toBe("name");
    expect($("#searchMode option[value=coords]").prop("disabled")).toBe(true);
    expect($(".name-search").css("display")).not.toBe("none");
    expect($(".coords-search").css("display")).toBe("none");
    ui.setStations("bg", [
      {
        uid: "6739029064",
        id: "6739029064",
        name: "Stadion Partizan · 278",
        coords: [44.786, 20.4577],
      },
    ]);
    $("#name-input").val("Stadion Partizan · 278");
    await ui.submitByName();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/api/bg/stop?stopId=6739029064" }),
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(timer).toHaveBeenCalledOnce();
    expect($("#stationName").text()).toBe("Station: Stadion Partizan · 278");
    expect($("#stationName").text()).not.toContain("6739029064");
    expect($("#lastUpdated").text()).toMatch(
      /^Last updated: \d{2}:\d{2}:\d{2} \(auto refresh - 60 seconds\)$/,
    );
    expect($("#updateInProgress").css("display")).toBe("none");
    expect(
      dom.window.L.featureGroup.mock.calls[0][0][0].tooltip,
    ).toBeUndefined();
    expect(
      dom.window.L.featureGroup.mock.calls[0][0][0].popup.textContent,
    ).toBe("Stadion Partizan · 278");
    expect($("#tableContainer").css("display")).not.toBe("none");
    expect($("#tabela").css("display")).not.toBe("none");
    expect($("#tableBody").text()).toContain("40");
    expect($("#tableBody").text()).toContain("estimate");
    expect($("#tableBody tr")).toHaveLength(1);
    expect($("#tableBody").text()).not.toContain("scheduled");
    expect($("#busRouteInfo").text()).toBe(
      "Click on bus number to view its route on map.",
    );
    expect($("#busRouteInfo").text()).not.toContain("View schedule");
    expect(map.setView).toHaveBeenCalledWith([44.786, 20.4577], 15, {
      animate: false,
    });
    expect(dom.window.L.featureGroup.mock.calls[0][0]).toHaveLength(1);
    ui.updateBgArrivals({
      name: "Stadion Partizan · 278",
      coords: [44.786, 20.4577],
      arrivals: [
        {
          lineNumber: "41",
          scheduledAt: new Date(Date.now() + 300_000).toISOString(),
          isEstimated: false,
        },
      ],
    });
    expect($("#tableContainer").css("display")).toBe("none");
    expect($("#noBusesMessage").text()).toContain("No live arrival estimates");

    ui.setStations("ns", []);
    ui.setLines("ns", {});
    $("#city").val("ns");
    await ui.onCityChange();
    expect($("#stationControls").css("display")).not.toBe("none");
    expect($("#searchMode option[value=coords]").prop("disabled")).toBe(false);
    expect($("#map").css("display")).not.toBe("none");
    expect($("#thead th").eq(1).text()).toBe("ETA");
    expect($("#thead th").eq(2).text()).toBe("Route");
    ui.cancelInterval();
  });

  it("recenters the map when selecting another BG stop", async () => {
    const { $, map, ui } = context;
    const stops = {
      first: {
        id: "1",
        uid: "1",
        name: "First",
        coords: [44.8, 20.4],
        arrivals: [],
      },
      second: {
        id: "2",
        uid: "2",
        name: "Second",
        coords: [44.9, 20.5],
        arrivals: [],
      },
    };
    await ui.onCityChange();
    ui.setStations("bg", Object.values(stops));
    $.ajax = vi.fn(({ url }) => {
      if (url.includes("vehicles")) return Promise.resolve({ vehicles: [] });
      return Promise.resolve(stops[url.endsWith("1") ? "first" : "second"]);
    });

    $("#name-input").val("First");
    await ui.submitByName();
    $("#name-input").val("Second");
    await ui.submitByName();

    expect(map.setView).toHaveBeenCalledWith(stops.first.coords, 15, {
      animate: false,
    });
    expect(map.setView).toHaveBeenCalledWith(stops.second.coords, 15, {
      animate: false,
    });
  });

  it("starts BG stop and vehicle requests together and ignores stale response", async () => {
    const { $, ui } = context;
    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const stopRequest = deferred();
    const vehicleRequest = deferred();
    await ui.onCityChange();
    ui.setStations("bg", [
      { uid: "6739029064", id: "6739029064", name: "Stop" },
    ]);
    ui.setQuery({ uid: "6739029064" });
    $.ajax = vi.fn(({ url }) =>
      url.includes("/stop?") ? stopRequest.promise : vehicleRequest.promise,
    );
    const pending = ui.fetchBgStop();
    expect($.ajax).toHaveBeenCalledTimes(2);
    expect($.ajax.mock.calls.map(([{ url }]) => url)).toEqual([
      "/api/bg/stop?stopId=6739029064",
      "/api/bg/vehicles?stopId=6739029064",
    ]);
    ui.setStations("ns", []);
    $("#city").val("ns");
    await ui.onCityChange();
    stopRequest.resolve({
      id: "6739029064",
      uid: "6739029064",
      name: "Stale",
      coords: [44, 20],
      arrivals: [],
    });
    vehicleRequest.resolve({ vehicles: [] });
    await pending;
    expect($("#stationName").text()).not.toContain("Stale");
  });

  it("ignores a BG stop response after another stop is selected", async () => {
    const { $, ui } = context;
    let resolveStop;
    let resolveVehicles;
    await ui.onCityChange();
    ui.setQuery({ uid: "first" });
    $.ajax = vi.fn(
      ({ url }) =>
        new Promise((resolve) => {
          if (url.includes("/stop?")) resolveStop = resolve;
          else resolveVehicles = resolve;
        }),
    );
    const pending = ui.fetchBgStop();
    ui.setQuery({ uid: "second" });
    resolveStop({
      id: "first",
      uid: "first",
      name: "Stale stop",
      coords: [44, 20],
      arrivals: [],
    });
    resolveVehicles({ vehicles: [] });
    await pending;
    expect($("#stationName").text()).not.toContain("Stale stop");
  });

  it("shows matched live BG buses on stop map and clears them after empty refresh", async () => {
    const { $, dom, layerGroup, map, ui } = context;
    const route = { lineId: "1704912322", threadId: "4898716406" };
    const stop = {
      name: "Stadion Partizan · 278",
      id: "6739029064",
      uid: "6739029064",
      coords: [44.786, 20.4577],
      arrivals: [
        {
          lineNumber: "40",
          destination: "Zvezdara",
          estimatedAt: new Date(Date.now() + 60_000).toISOString(),
          isEstimated: true,
          vehicleId: "belgrade|P82023",
          route,
        },
      ],
    };
    const vehicle = {
      id: "belgrade|P82023",
      lineNumber: "40",
      coords: [44.71, 20.41],
    };
    await ui.onCityChange();
    const request = vi.fn(({ url }) =>
      Promise.resolve(
        url.startsWith("/api/bg/vehicles") ? { vehicles: [vehicle] } : stop,
      ),
    );
    $.ajax = request;
    const marker = vi.spyOn(dom.window.L, "marker");
    ui.setStations("bg", [
      { uid: stop.id, id: stop.id, name: stop.name, coords: stop.coords },
    ]);
    $("#name-input").val(stop.name);
    await ui.submitByName();

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/bg/vehicles?stopId=6739029064",
      }),
    );
    expect(marker).toHaveBeenCalledWith(
      vehicle.coords,
      expect.objectContaining({ icon: expect.anything() }),
    );
    expect(map.fitBounds).toHaveBeenCalledWith("bounds", {
      animate: false,
      padding: [40, 40],
    });

    request.mockImplementation(({ url }) =>
      Promise.resolve(
        url.startsWith("/api/bg/vehicles") ? { vehicles: [] } : stop,
      ),
    );
    const removeCount = layerGroup.removeLayer.mock.calls.length;
    await ui.updateBgArrivals(stop);
    expect(layerGroup.removeLayer).toHaveBeenCalledTimes(removeCount + 1);
    expect(
      marker.mock.calls.filter(
        ([coords]) =>
          coords[0] === vehicle.coords[0] && coords[1] === vehicle.coords[1],
      ),
    ).toHaveLength(1);
  });

  it("opens BG route from arrival line and draws route in blue", async () => {
    const { $, dom, map, ui } = context;
    const route = { lineId: "1704912322", threadId: "4898716406" };
    const data = {
      ...route,
      name: "40",
      stops: [
        { name: "Banjica", coords: [44.7, 20.4] },
        { name: "Zvezdara", coords: [44.72, 20.42] },
      ],
      segments: [
        [
          [44.7, 20.4],
          [44.71, 20.41],
          [44.72, 20.42],
        ],
      ],
    };
    const stop = {
      name: "Stadion Partizan",
      id: "6739029064",
      coords: [44.786, 20.4577],
      arrivals: [
        {
          lineNumber: "40",
          destination: "Zvezdara",
          estimatedAt: new Date(Date.now() + 60_000).toISOString(),
          isEstimated: true,
          route,
        },
      ],
    };
    await ui.onCityChange();
    $.ajax = vi.fn().mockResolvedValue(data);
    ui.updateBgArrivals(stop);
    $("#tableBody tr").first().trigger("click");
    await new Promise((resolve) => setImmediate(resolve));
    expect($.ajax).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/bg/routes/1704912322/4898716406?stopId=6739029064",
      }),
    );
    expect($("#scheduleSection").css("display")).toBe("none");
    expect($("#scheduleContainer").text()).toBe("");
    expect($("#scheduleInfo").text()).not.toContain("Route 40");
    expect(dom.window.L.polyline).toHaveBeenCalledWith(data.segments, {
      color: "blue",
    });
    expect(map.fitBounds).toHaveBeenCalledWith("route-bounds");
    ui.updateBgArrivals(stop);
    expect(dom.window.L.polyline).toHaveBeenCalledTimes(1);
    expect(
      dom.window.L.featureGroup.mock.calls.every(
        ([markers]) => markers.length === 1,
      ),
    ).toBe(true);
  });

  it("keeps arrivals when BG route fails and ignores route response after city change", async () => {
    const { $, ui } = context;
    await ui.onCityChange();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route = { lineId: "1", threadId: "2" };
    ui.updateBgArrivals({
      name: "Stadion Partizan",
      id: "278",
      coords: [44.786, 20.4577],
      arrivals: [
        {
          lineNumber: "40",
          destination: "Zvezdara",
          estimatedAt: new Date(Date.now() + 60_000).toISOString(),
          isEstimated: true,
          route,
        },
      ],
    });
    $.ajax = vi.fn().mockRejectedValue(new Error("upstream failed"));
    await ui.showBgRoute(route);
    expect($("#tableBody").text()).toContain("40");
    expect($("#scheduleSection").css("display")).toBe("none");
    expect($("#error").css("display")).not.toBe("none");
    let finish;
    $.ajax.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = ui.showBgRoute({ lineId: "1", threadId: "2" });
    ui.setStations("ns", []);
    ui.setLines("ns", {});
    $("#city").val("ns");
    await ui.onCityChange();
    finish({ name: "40", stops: [], segments: [] });
    await pending;
    expect($("#scheduleSection").css("display")).toBe("none");
  });

  it("formats seconds as whole minutes", () => {
    expect(context.ui.formatSeconds(125)).toBe("2 min");
    expect(context.ui.formatSeconds(59)).toBe("0 min");
  });

  it("switches visible search controls when mode changes", () => {
    const { $, ui } = context;

    $("#searchMode").val("name");
    ui.onSearchModeChange();
    expect($("#submit").css("display")).toBe("none");
    expect($(".name-search").css("display")).not.toBe("none");
    expect($(".coords-search").css("display")).toBe("none");

    $("#searchMode").val("coords");
    ui.setStations("bg", [
      {
        uid: "station-1",
        name: "Main Station",
        id: "42",
        coords: [44.8, 20.4],
      },
    ]);
    context.dom.window.navigator.geolocation = {
      getCurrentPosition(success) {
        success({ coords: { latitude: 44.8, longitude: 20.4 } });
      },
    };
    ui.onSearchModeChange();
    expect($("#submit").css("display")).not.toBe("none");
    expect($(".coords-search").css("display")).not.toBe("none");
  });

  it("renders arrivals and sorts vehicles by line number", () => {
    const { $, layerGroup, map, ui } = context;

    $("#updateInProgress").show();
    ui.updateArrivals(
      {
        name: "Main Station",
        id: "42",
        uid: "station-1",
        coords: [44.8, 20.4],
        vehicles: [
          {
            lineNumber: "12",
            secondsLeft: 360,
            main_line_title: "Long route",
            coords: [44.81, 20.41],
            allStations: [{ latitude: 44.8, longitude: 20.4 }],
          },
          {
            lineNumber: "7",
            secondsLeft: 120,
            main_line_title: "Short route",
            coords: [44.82, 20.42],
            allStations: [{ latitude: 44.8, longitude: 20.4 }],
          },
        ],
      },
      true,
    );

    const rows = $("#tableBody tr")
      .toArray()
      .map((row) => $(row).text().replace(/\s+/g, " ").trim());

    expect($("#stationName").text()).toBe("Station: Main Station (42)");
    expect($("#lastUpdated").text()).toMatch(
      /^Last updated: \d{2}:\d{2}:\d{2} \(auto refresh - 60 seconds\)$/,
    );
    expect($("#updateInProgress").css("display")).toBe("none");
    expect(rows[0]).toContain("7");
    expect(rows[0]).toContain("2 min");
    expect(rows[1]).toContain("12");
    expect(layerGroup.clearLayers).toHaveBeenCalled();
    expect(map.setView).toHaveBeenCalledWith([44.8, 20.4], 13, {
      animation: true,
    });
    expect(map.fitBounds).toHaveBeenCalledWith("bounds", {
      padding: [40, 40],
    });
  });

  it("renders provider markup as text in arrivals and schedule", async () => {
    const { $, dom, ui } = context;
    ui.updateArrivals(
      {
        name: "<img src=x onerror=alert(1)>",
        id: "1",
        uid: "u",
        coords: [44, 20],
        vehicles: [
          {
            lineNumber: "<svg onload=alert(1)>",
            secondsLeft: 60,
            main_line_title: "<b>route</b>",
            coords: [44, 20],
            allStations: [],
          },
        ],
      },
      false,
    );
    expect($("#stationName img, #tableBody svg, #tableBody b")).toHaveLength(0);
    expect($("#tableBody").text()).toContain("<b>route</b>");
    const markers = dom.window.L.featureGroup.mock.calls[0][0];
    expect(markers[0].popup.textContent).toBe(
      "<img src=x onerror=alert(1)> (1)",
    );
    expect(markers[1].popup.textContent).toBe("<b>route</b>");
    expect(markers[1].tooltip.textContent).toBe("<svg onload=alert(1)>");
    $.ajax = vi.fn().mockResolvedValue({
      date: "2026-04-29",
      schedule: { "<img src=x>": ["<script>alert(1)</script>"] },
    });
    await ui.fetchSchedule("bg", "u", true);
    expect($("#scheduleContainer img, #scheduleContainer script")).toHaveLength(
      0,
    );
    expect($("#scheduleContainer").text()).toContain("<img src=x>");
  });

  it("renders nearby station options as text", async () => {
    const { $, ui } = context;
    $("#city").val("ns");
    ui.setStations("ns", [
      { uid: "u", id: "<svg>", name: "<img src=x>", coords: [44, 20] },
    ]);
    await ui.searchByCoords(
      { latitude: 44, longitude: 20 },
      "#stationsMaxDistance-input",
      "#coords-input",
    );
    expect($("#coords-input img, #coords-input svg")).toHaveLength(0);
    expect($("#coords-input option").text()).toContain("<img src=x>");
  });

  it("keeps arrivals without vehicle coordinates out of Leaflet markers", () => {
    const { $, dom, ui } = context;
    ui.updateArrivals(
      {
        name: "Stop",
        id: "1",
        uid: "u",
        coords: [44, 20],
        vehicles: [
          {
            lineNumber: "7",
            secondsLeft: 60,
            coords: [null, undefined],
            allStations: [],
          },
        ],
      },
      false,
    );
    expect($("#tableBody").text()).toContain("7");
    expect(dom.window.L.featureGroup.mock.calls[0][0]).toHaveLength(1);
  });

  it("ignores older arrival responses for same stop and after city changes", async () => {
    const { $, ui } = context;
    const query = { uid: "station" };
    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const first = deferred();
    const second = deferred();
    $.ajax = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    $("#city").val("ns");
    ui.setStations("ns", []);
    ui.setStations("nis", []);
    await ui.onCityChange();
    ui.setQuery(query);

    const older = ui.fetchArrivals("ns", query, false);
    const newer = ui.fetchArrivals("ns", query, false);
    second.resolve({
      name: "New result",
      id: "2",
      uid: query.uid,
      coords: [44, 20],
      vehicles: [],
    });
    await newer;
    first.resolve({
      name: "Old result",
      id: "1",
      uid: query.uid,
      coords: [44, 20],
      vehicles: [],
    });
    await older;
    expect($("#stationName").text()).toBe("Station: New result (2)");

    const stale = deferred();
    $.ajax.mockReturnValueOnce(stale.promise);
    ui.setQuery(query);
    const pending = ui.fetchArrivals("ns", query, false);
    $("#city").val("nis");
    await ui.onCityChange();
    stale.resolve({
      name: "Wrong city",
      id: "3",
      uid: query.uid,
      coords: [44, 20],
      vehicles: [],
    });
    await pending;
    expect($("#stationName").text()).toBe("Station: New result (2)");
  });

  it("loads route map only when route fallback needs it", async () => {
    const { $, dom, ui } = context;
    ui.setStations("ns", [
      { uid: "a", coords: [44.1, 20.1] },
      { uid: "b", coords: [44.2, 20.2] },
    ]);
    $("#city").val("ns");
    $.ajax = vi.fn().mockResolvedValue({ "7_A": ["a", "b"] });
    dom.window.fetch.mockResolvedValue({
      json: async () => ({ code: "Ok", routes: [] }),
    });

    await ui.onCityChange();
    expect($.ajax).not.toHaveBeenCalled();
    await ui.addRouteToMap("7", []);
    expect($.ajax).toHaveBeenCalledWith({
      url: "/api/lines/ns",
      type: "GET",
      data: {},
    });
  });

  it("does not reuse cached schedules across cities with same uid", async () => {
    const { $, ui } = context;
    $.ajax = vi
      .fn()
      .mockResolvedValue({ date: "2026-04-29", schedule: { 7: ["10:00"] } });
    $("#city").val("ns");
    ui.setStations("ns", []);
    ui.setStations("nis", []);
    await ui.onCityChange();
    await ui.fetchSchedule("ns", "shared", true);
    $("#city").val("nis");
    await ui.onCityChange();
    await ui.fetchSchedule("nis", "shared");
    expect($.ajax).toHaveBeenCalledTimes(2);
    expect($.ajax.mock.calls[1][0].url).toBe(
      "/api/stations/nis/schedule?uid=shared",
    );
  });

  it("sorts line names without a numeric prefix", () => {
    const { $, ui } = context;
    ui.updateArrivals(
      {
        name: "Stop",
        id: "1",
        uid: "u",
        coords: [44, 20],
        vehicles: [
          {
            lineNumber: "EKO1",
            secondsLeft: 10,
            coords: [44, 20],
            allStations: [],
          },
          {
            lineNumber: "7A",
            secondsLeft: 20,
            coords: [44, 20],
            allStations: [],
          },
        ],
      },
      false,
    );
    expect($("#tableBody tr").first().text()).toContain("7A");
    expect($("#tableBody tr").last().text()).toContain("EKO1");
  });

  it("routes ordered bus stops along roads", async () => {
    const geometry = {
      type: "LineString",
      coordinates: [
        [20.1, 44.1],
        [20.15, 44.15],
        [20.2, 44.2],
      ],
    };
    const { dom, ui } = context;
    ui.setStations("bg", [
      { uid: "first", coords: [44.1, 20.1] },
      { uid: "second", coords: [44.2, 20.2] },
    ]);
    ui.setLines("bg", { "7_A": ["first", "second"] });
    dom.window.fetch.mockResolvedValue({
      json: async () => ({ code: "Ok", routes: [{ geometry }] }),
    });

    await ui.addRouteToMap("7", []);

    expect(dom.window.fetch).toHaveBeenCalledWith(
      "/api/route?coords=20.1%2C44.1%3B20.2%2C44.2",
    );
    expect(dom.window.L.geoJSON).toHaveBeenCalledWith(geometry, {
      style: { color: "blue" },
    });
  });

  it("falls back to straight stop connections when road routing fails", async () => {
    const { dom, ui } = context;
    const stops = [
      { latitude: 44.1, longitude: 20.1 },
      { latitude: 44.2, longitude: 20.2 },
    ];
    dom.window.fetch.mockRejectedValue(new Error("routing unavailable"));

    await ui.addRouteToMap("7", stops);

    expect(dom.window.fetch).toHaveBeenCalledWith(
      "/api/route?coords=20.1%2C44.1%3B20.2%2C44.2",
    );
    expect(dom.window.L.polyline).toHaveBeenCalledWith(
      [
        [44.1, 20.1],
        [44.2, 20.2],
      ],
      { color: "blue" },
    );
  });

  it("shows an empty-state message when no vehicles are arriving", () => {
    const { $, ui } = context;

    ui.updateArrivals(
      {
        name: "Quiet Station",
        id: "99",
        uid: "station-99",
        coords: [44.8, 20.4],
        vehicles: [],
      },
      false,
    );

    expect($("#noBusesMessage").css("display")).not.toBe("none");
    expect($("#tableContainer").css("display")).toBe("none");
  });

  it("renders station schedule returned by the API", async () => {
    const { $, ui } = context;
    $.ajax = vi.fn().mockResolvedValue({
      date: "2026-04-29",
      schedule: {
        7: ["23:57", "23:58(+24h)"],
      },
    });

    await ui.fetchSchedule("bg", "station-1", true);

    expect($.ajax).toHaveBeenCalledWith({
      url: "/api/stations/bg/schedule?uid=station-1",
      type: "GET",
      data: {},
    });
    expect($("#scheduleInfo").text()).toBe("Schedule for 29/4/2026:");
    expect($("#scheduleContainer").text()).toContain("DEPARTURES");
    expect($("#scheduleContainer").text()).toContain("23:57");
    expect($("#scheduleContainer").text()).toContain("23:58*");
    expect($("#scheduleContainer > div").css("overflow-x")).toBe("auto");
    expect($("#scheduleContainer span").first().css("display")).toBe(
      "inline-block",
    );
  });

  it("sorts nearby stations by distance", async () => {
    const { ui } = context;

    const result = await ui.findClosestStations(
      { latitude: 44.8125, longitude: 20.4614 },
      [
        { uid: "far", coords: [44.9, 20.5] },
        { uid: "near", coords: [44.8126, 20.4615] },
      ],
      20000,
    );

    expect(result.map((item) => item.station.uid)).toEqual(["near", "far"]);
    expect(result[0].distance).toBeLessThan(result[1].distance);
  });
});
