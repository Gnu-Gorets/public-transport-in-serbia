import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const scriptPath = resolve("static/script.js");

const createMarker = () => ({
  bindPopup() {
    return this;
  },
  bindTooltip() {
    return this;
  },
  on() {
    return this;
  },
});

function loadUiScript() {
  const dom = new JSDOM(
    `<!doctype html>
    <body>
      <select id="city"><option value="bg">Belgrade</option><option value="ns">Novi Sad</option></select>
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
  $.fn.ready = function ready() {
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
    })),
    geoJSON: vi.fn(() => ({
      addTo() {
        return this;
      },
    })),
  };

  const source = `${readFileSync(scriptPath, "utf8")}
    window.__ui = {
      fetchSchedule,
      findClosestStations,
      formatSeconds,
      cancelInterval,
      onCityChange,
      onSearchModeChange,
      submitByName,
      updateArrivals,
      updateBgArrivals,
      setStations(city, stations) {
        allStations[city] = stations;
      },
      getStations(city) {
        return allStations[city];
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

  return { dom, $, map, layerGroup, ui: dom.window.__ui };
}

describe("UI behavior", () => {
  let context;

  beforeEach(() => {
    vi.restoreAllMocks();
    context = loadUiScript();
  });

  afterEach(() => context.ui.cancelInterval());

  it("uses native Leaflet map without Yandex iframe or link", () => {
    const html = readFileSync(resolve("static/index.html"), "utf8");
    expect(html).toContain('<div id="map"></div>');
    expect(html).not.toContain("bgYandexMap");
    expect(html).not.toContain("bgTransportLink");
    expect(html).not.toContain("yandex.com/map-widget");
  });

  it("shows BG stop arrivals on native map and restores controls for NS", async () => {
    const { $, dom, map, ui } = context;
    const request = vi.spyOn($, "ajax").mockResolvedValue({
      city: "bg",
      name: "Stadion Partizan · 278",
      uid: "3833919270",
      id: "3833919270",
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

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "/api/bg/poc/stop" }));
    expect($("#map").css("display")).not.toBe("none");
    expect($("#stationControls").css("display")).not.toBe("none");
    expect($("#searchMode").val()).toBe("name");
    expect($("#searchMode option[value=coords]").prop("disabled")).toBe(true);
    expect($(".name-search").css("display")).not.toBe("none");
    expect($(".coords-search").css("display")).toBe("none");
    expect(ui.getStations("bg")).toEqual([{
      uid: "3833919270",
      id: "3833919270",
      name: "Stadion Partizan · 278",
      coords: [44.786, 20.4577],
      lines: [],
    }]);
    $("#name-input").val("Stadion Partizan · 278");
    ui.submitByName();
    expect(request).toHaveBeenCalledTimes(1);
    expect($("#stationName").text()).toContain("Stadion Partizan");
    expect($("#tableContainer").css("display")).not.toBe("none");
    expect($("#tabela").css("display")).not.toBe("none");
    expect($("#tableBody").text()).toContain("40");
    expect($("#tableBody").text()).toContain("estimate");
    expect($("#tableBody").text()).toContain("scheduled");
    expect($("#busRouteInfo").text()).toContain("vehicle coordinates are unavailable");
    expect(map.setView).toHaveBeenCalledWith([44.786, 20.4577], 15, { animation: true });
    expect(dom.window.L.featureGroup.mock.calls[0][0]).toHaveLength(1);

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
      { uid: "station-1", name: "Main Station", id: "42", coords: [44.8, 20.4] },
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
    expect(rows[0]).toContain("7");
    expect(rows[0]).toContain("2 min");
    expect(rows[1]).toContain("12");
    expect(layerGroup.clearLayers).toHaveBeenCalled();
    expect(map.setView).toHaveBeenCalledWith([44.8, 20.4], 13, {
      animation: true,
    });
    expect(map.fitBounds).toHaveBeenCalledWith("bounds");
  });

  it("routes ordered bus stops along roads", async () => {
    const geometry = { type: "LineString", coordinates: [[20.1, 44.1], [20.15, 44.15], [20.2, 44.2]] };
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
      [[44.1, 20.1], [44.2, 20.2]],
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
