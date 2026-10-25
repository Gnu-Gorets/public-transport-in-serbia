import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      <select id="city"><option value="bg">Belgrade</option></select>
      <select id="searchMode"><option value="name">Name</option><option value="coords">Coords</option></select>
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
      <table id="tabela"><tbody id="tableBody"></tbody></table>
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
      onSearchModeChange,
      updateArrivals,
      setStations(city, stations) {
        allStations[city] = stations;
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
