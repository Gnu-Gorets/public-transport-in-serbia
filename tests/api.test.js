import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import server from "../server/server.js";

const require = createRequire(import.meta.url);
const logger = require("../server/logger.js");
const yandexBelgradeService = require("../server/services/yandexBelgradeService.js");
const belgradeStops = require("../server/data/yandex-belgrade-bus-stops.json");
const { validateStops } = require("../server/services/belgradeStopsService.js");
const { fastify, _test } = server;

const yandexStopPage = `<script type="application/json" class="state-view">${JSON.stringify(
  {
    config: {
      masstransitStop: {
        id: "6739029064",
        name: "Стадион Партизан · 278",
        coordinates: [20.4577, 44.786],
        transports: [
          {
            name: "40",
            type: "trolleybus",
            threads: [
              {
                BriefSchedule: {
                  Events: [
                    {
                      Scheduled: { value: "1792943111" },
                      Estimated: { value: "1792943178" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  },
)}</script>`;

const stationsResponse = (
  name = "Main Station",
  id = "42",
  uid = "station-1",
) => ({
  stations: [
    {
      name,
      id: uid,
      station_id: id,
      coordinates: {
        latitude: 44.8,
        longitude: 20.4,
      },
      lines_for_station: ["7"],
    },
  ],
  lines: [
    {
      line_number_for_display: "7",
      direction_id_for_display: "A",
      all_stations: [uid],
    },
  ],
});

describe("API routes", () => {
  beforeEach(() => {
    _test.resetState();
    yandexBelgradeService._test.resetCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it("serves the UI entrypoint", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Serbia++");
    expect(response.body).toContain("static/script.js?v=bg-live-vehicles-1");
  });

  it("validates Belgrade catalog IDs, names, coordinates, and uniqueness", () => {
    const valid = {
      updatedAt: "2026-10-27",
      stops: [{ id: "1", name: "Stop", coords: [44.8, 20.4] }],
    };
    expect(validateStops(valid)).toBe(valid);
    expect(() =>
      validateStops({ ...valid, stops: [...valid.stops, valid.stops[0]] }),
    ).toThrow();
    expect(() =>
      validateStops({
        ...valid,
        stops: [{ ...valid.stops[0], coords: [0, 0] }],
      }),
    ).toThrow();
  });

  it("serves the checked-in Belgrade stop catalog locally", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/bg/stops",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    expect(response.json()).toEqual(belgradeStops);
  });

  it("requires uid when requesting a station schedule", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain(
      "must have required property 'uid'",
    );
  });

  it("returns 404 when schedule station is unknown", async () => {
    _test.setState({
      allStations: {
        ns: {},
      },
      cacheMeta: { ns: { loadedAt: Date.now() } },
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule?uid=missing&date=2026-04-29",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Station not found" });
  });

  it("returns 400 for invalid station search query", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("must match a schema in anyOf");
  });

  it("lists Belgrade without enabling its provider endpoints", async () => {
    const httpClient = {
      get: vi.fn(),
      post: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    _test.setHttpClient(httpClient);

    const first = await fastify.inject({ method: "GET", url: "/api/cities" });
    const second = await fastify.inject({ method: "GET", url: "/api/cities" });

    const expected = { bg: "Belgrade", ns: "Novi Sad", nis: "Nis" };
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual(expected);
    expect(second.json()).toEqual(expected);
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it("returns cached station details when V1 has no arrivals", async () => {
    _test.setState({
      allStations: {
        ns: {
          4970: {
            uid: "4970",
            id: "4970",
            name: "Main Station",
            coords: [44.8, 20.4],
          },
        },
      },
      uid_id_map: { ns: { 4970: "4970" } },
    });
    const httpClient = {
      get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      post: vi.fn(),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search?uid=4970",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      city: "ns",
      name: "Main Station",
      uid: "4970",
      id: "4970",
      coords: [44.8, 20.4],
      vehicles: [],
    });
    expect(httpClient.get).toHaveBeenCalledWith(
      "https://online.nsmart.rs/publicapi/v1/announcement/announcement.php?ibfm=TM000001&action=get_announcement_data&station_uid=4970",
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it("transforms valid V1 station responses", async () => {
    _test.setState({
      uid_id_map: { ns: { 4970: "4970" } },
      allStations: {
        ns: {
          4970: {
            uid: "4970",
            id: "4970",
            name: "Main Station",
            coords: [44.8, 20.4],
          },
        },
      },
    });
    _test.setHttpClient({
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: [
          {
            station_uid: "4970",
            station_name: "Main Station",
            just_coordinates: "1",
          },
        ],
      }),
      post: vi.fn(),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search?uid=4970",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      city: "ns",
      name: "Main Station",
      uid: "4970",
      id: "4970",
      coords: [44.8, 20.4],
      vehicles: [],
    });
  });

  it("preserves valid arrivals when individual vehicle rows are malformed", async () => {
    _test.setHttpClient({
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: [
          { station_uid: "4970", station_name: "Main Station" },
          {
            line_number: "7",
            seconds_left: "120",
            line_title: "7",
            all_stations: [
              { coordinates: { latitude: "44.8", longitude: "20.4" } },
            ],
          },
          { line_number: "8", line_title: "8" },
          { line_number: "9", seconds_left: "unknown" },
          { line_number: {}, seconds_left: 30 },
        ],
      }),
      post: vi.fn(),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search?uid=4970",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().vehicles).toEqual([
      expect.objectContaining({
        lineNumber: "7",
        secondsLeft: "120",
        allStations: [{ latitude: 44.8, longitude: 20.4 }],
      }),
    ]);
  });

  it("returns 400 for empty V1 response when station is not cached", async () => {
    _test.setHttpClient({
      get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      post: vi.fn(),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search?uid=missing",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Station not found" });
  });

  it.each([null, [null], [{}]])(
    "returns 502 for malformed V1 response %j",
    async (data) => {
      _test.setHttpClient({
        get: vi.fn().mockResolvedValue({ status: 200, data }),
        post: vi.fn(),
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/stations/ns/search?uid=4970",
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: "Endpoint returned invalid station data",
      });
    },
  );

  it("preserves V1 invalid-station responses", async () => {
    _test.setHttpClient({
      get: vi
        .fn()
        .mockResolvedValue({ status: 200, data: [{ success: false }] }),
      post: vi.fn(),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search?uid=missing",
    });

    expect(response.statusCode).toBe(400);
  });

  it("serves repeated Belgrade stop requests from 30-second cache", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ status: 200, data: yandexStopPage });
    _test.setHttpClient({ get, post: vi.fn() });

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        fastify.inject({
          method: "GET",
          url: "/api/bg/stop?stopId=6739029064",
        }),
      ),
    );

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200,
    ]);
    expect(responses[0].headers["cache-control"]).toBe("no-store");
    expect(responses[0].json()).toMatchObject({
      city: "bg",
      uid: "6739029064",
      coords: [44.786, 20.4577],
      arrivals: [{ lineNumber: "40", isEstimated: true }],
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("serves uncached BG vehicle positions with no-store", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ status: 200, data: yandexStopPage });
    _test.setHttpClient({ get, post: vi.fn() });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/bg/vehicles?stopId=6739029064",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ vehicles: [] });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("returns Yandex parsing failures instead of cached success data", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ status: 200, data: "<html>captcha</html>" });
    _test.setHttpClient({ get, post: vi.fn() });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/bg/stop?stopId=6739029064",
    });

    expect(response.statusCode).toBe(502);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("serves BG route stops and geometry for matching direction", async () => {
    const html = yandexStopPage
      .replace(
        '"type":"trolleybus"',
        '"type":"trolleybus","lineId":"123","uri":"ymapsbm1://transit/line?id=123","seoname":"40"',
      )
      .replace('"threads":[{', '"threads":[{"threadId":"456",');
    const routeHtml = `<script type="application/json" class="state-view">${JSON.stringify(
      {
        config: {
          masstransitLine: {
            features: [
              {
                properties: {
                  ThreadMetaData: { id: "456", lineId: "123", name: "40" },
                },
                features: [
                  { id: "a", name: "Бањица", coordinates: [20.4, 44.7] },
                  {
                    points: [
                      [20.4, 44.7],
                      [20.5, 44.8],
                    ],
                  },
                  { id: "b", name: "Звездара", coordinates: [20.5, 44.8] },
                ],
              },
            ],
          },
        },
      },
    )}</script>`;
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, data: html })
      .mockResolvedValueOnce({ status: 200, data: routeHtml });
    _test.setHttpClient({ get, post: vi.fn() });
    const response = await fastify.inject({
      method: "GET",
      url: "/api/bg/routes/123/456?stopId=6739029064",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      lineId: "123",
      threadId: "456",
      stops: [
        { name: "Banjica", coords: [44.7, 20.4] },
        { name: "Zvezdara", coords: [44.8, 20.5] },
      ],
      segments: [
        [
          [44.7, 20.4],
          [44.8, 20.5],
        ],
      ],
    });
  });

  it("validates BG route identifiers before upstream calls", async () => {
    const get = vi.fn();
    _test.setHttpClient({ get, post: vi.fn() });
    const response = await fastify.inject({
      method: "GET",
      url: "/api/bg/routes/invalid/123",
    });
    expect(response.statusCode).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects BG routes not supplied by stop metadata", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ status: 200, data: yandexStopPage });
    _test.setHttpClient({ get, post: vi.fn() });
    const response = await fastify.inject({
      method: "GET",
      url: "/api/bg/routes/123/456?stopId=6739029064",
    });
    expect(response.statusCode).toBe(404);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("rejects disabled Belgrade endpoints", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/bg/all",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain(
      "must be equal to one of the allowed values",
    );
  });

  it("returns 400 for unknown city params", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/unknown/all",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain(
      "must be equal to one of the allowed values",
    );
  });

  it("returns 400 for invalid schedule date format", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule?uid=station-1&date=29-04-2026",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("must match pattern");
  });

  it("rejects impossible schedule dates and accepts leap dates", async () => {
    _test.setState({
      allStations: {
        ns: { station: { uid: "station", id: "1", name: "Stop", lines: [] } },
      },
      cacheMeta: { ns: { loadedAt: Date.now() } },
    });
    const post = vi.fn();
    _test.setHttpClient({ get: vi.fn(), post });

    const impossible = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule?uid=station&date=2025-02-29",
    });
    expect(impossible.statusCode).toBe(400);
    expect(impossible.json()).toEqual({ error: "Invalid schedule date" });
    expect(post).not.toHaveBeenCalled();

    const leap = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule?uid=station&date=2024-02-29",
    });
    expect(leap.statusCode).toBe(200);
    expect(leap.json().date).toBe("2024-02-29");
  });

  it("loads the station map before resolving an ID search on cold start", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      post: vi
        .fn()
        .mockResolvedValue({ status: 200, data: stationsResponse() }),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search?id=42",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      uid: "station-1",
      name: "Main Station",
      coords: [44.8, 20.4],
    });
    expect(httpClient.post).toHaveBeenCalledOnce();
    expect(httpClient.get).toHaveBeenCalledWith(
      expect.stringContaining("station_uid=station-1"),
      expect.any(Object),
    );
  });

  it("rejects IDs absent from a populated station map", async () => {
    _test.setNow(() => 1_000);
    _test.setState({
      allStations: {
        ns: {
          known: {
            uid: "known",
            id: "42",
            name: "Known",
            coords: [44.8, 20.4],
          },
        },
      },
      cacheMeta: { ns: { loadedAt: 1_000 } },
    });
    const httpClient = { get: vi.fn(), post: vi.fn() };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/search?id=404",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Station not found" });
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it("returns 502 when station provider request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    _test.setHttpClient({
      get: vi.fn(),
      post: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/all",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "provider unavailable" });
  });

  it("uses fresh cached stations without calling provider", async () => {
    _test.setNow(() => 1_000);
    _test.setState({
      allStations: {
        ns: {
          "station-1": {
            uid: "station-1",
            id: "42",
            name: "Cached Station",
            coords: [44.8, 20.4],
            lines: ["7"],
          },
        },
      },
      allLines: {
        ns: {
          "7_A": ["station-1"],
        },
      },
      cacheMeta: {
        ns: {
          loadedAt: 1_000,
        },
      },
    });
    const httpClient = {
      get: vi.fn(),
      post: vi.fn(),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/all",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        uid: "station-1",
        id: "42",
        name: "Cached Station",
        coords: [44.8, 20.4],
        lines: ["7"],
      },
    ]);
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it("refreshes station cache after the stale window expires", async () => {
    _test.setNow(() => 9 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        ns: {
          old: {
            uid: "old",
            id: "1",
            name: "Old Station",
            coords: [44.7, 20.3],
            lines: [],
          },
        },
      },
      cacheMeta: {
        ns: {
          loadedAt: 1_000,
        },
      },
    });
    const httpClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        status: 200,
        data: stationsResponse("Fresh Station", "42", "station-1"),
      }),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/all",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        uid: "station-1",
        id: "42",
        name: "Fresh Station",
        coords: [44.8, 20.4],
        lines: ["7"],
      },
    ]);
    expect(httpClient.post).toHaveBeenCalledWith(
      "https://online.nsmart.rs/publicapi/v1/networkextended.php",
      JSON.stringify({ action: "get_cities_extended" }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("serves stale station cache while refreshing in background", async () => {
    _test.setNow(() => 2 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        ns: {
          "station-1": {
            uid: "station-1",
            id: "42",
            name: "Stale Station",
            coords: [44.8, 20.4],
            lines: ["7"],
          },
        },
      },
      cacheMeta: { ns: { loadedAt: 1_000 } },
    });
    let finishRefresh;
    const httpClient = {
      get: vi.fn(),
      post: vi.fn(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve;
          }),
      ),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/all",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0].name).toBe("Stale Station");
    expect(httpClient.post).toHaveBeenCalledOnce();
    finishRefresh({
      status: 200,
      data: stationsResponse("Fresh Station", "42", "station-1"),
    });
    await vi.waitFor(async () => {
      const refreshed = await fastify.inject({
        method: "GET",
        url: "/api/stations/ns/all",
      });
      expect(refreshed.json()[0].name).toBe("Fresh Station");
    });
  });

  it("serves stale station cache when refresh fails", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    _test.setNow(() => 2 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        ns: {
          "station-1": {
            uid: "station-1",
            id: "42",
            name: "Stale Station",
            coords: [44.8, 20.4],
            lines: ["7"],
          },
        },
      },
      cacheMeta: {
        ns: {
          loadedAt: 1_000,
        },
      },
    });
    _test.setHttpClient({
      get: vi.fn(),
      post: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/all",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        uid: "station-1",
        id: "42",
        name: "Stale Station",
        coords: [44.8, 20.4],
        lines: ["7"],
      },
    ]);
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "Station cache refresh failed for ns; serving stale data",
      ),
    );
  });

  it("rejects expired station cache when refresh fails beyond the stale window", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    _test.setNow(() => 9 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        ns: {
          old: {
            uid: "old",
            id: "1",
            name: "Old Station",
            coords: [],
            lines: [],
          },
        },
      },
      cacheMeta: { ns: { loadedAt: 1_000 } },
    });
    _test.setHttpClient({
      get: vi.fn(),
      post: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/all",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "provider unavailable" });
  });

  it("refreshes stale station cache before serving lines", async () => {
    _test.setNow(() => 2 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        ns: { old: { uid: "old", id: "1", name: "Old", lines: [] } },
      },
      allLines: { ns: { old: ["old"] } },
      cacheMeta: { ns: { loadedAt: 1_000 } },
    });
    const httpClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockResolvedValue({ status: 200, data: stationsResponse() }),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/lines/ns",
    });

    expect(response.statusCode).toBe(200);
    expect(httpClient.post).toHaveBeenCalledOnce();
  });

  it("checks station cache freshness before serving schedules", async () => {
    _test.setNow(() => 2 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        ns: {
          "station-1": {
            uid: "station-1",
            id: "42",
            name: "Main Station",
            lines: [],
          },
        },
      },
      cacheMeta: { ns: { loadedAt: 1_000 } },
    });
    const httpClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockResolvedValue({ status: 200, data: stationsResponse() }),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule?uid=station-1&date=2026-04-29",
    });

    expect(response.statusCode).toBe(200);
    expect(httpClient.post).toHaveBeenCalledOnce();
  });

  it("builds a station schedule from timetable responses", async () => {
    _test.setState({
      allStations: {
        ns: {
          "station-1": {
            uid: "station-1",
            id: "42",
            name: "Main Station",
            lines: ["7"],
          },
        },
      },
      cacheMeta: { ns: { loadedAt: Date.now() } },
    });

    const httpClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          data: [
            {
              station_id: "station-1",
              departure_time: ["23:58(+24h)", "23:59(+24h)"],
            },
          ],
        })
        .mockResolvedValueOnce({
          status: 200,
          data: [
            {
              station_id: "station-1",
              departure_time: ["23:57(+24h)", "23:58(+24h)"],
            },
          ],
        }),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule?uid=station-1&date=2026-04-29",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      station: { uid: "station-1", name: "Main Station", id: "42" },
      schedule: {
        7: ["23:57(+24h)", "23:58(+24h)", "23:59(+24h)"],
      },
      date: "2026-04-29",
    });
  });

  it.each(["2026-04-28", "2026-04-30"])(
    "keeps all departures for non-current date %s",
    async (date) => {
      vi.setSystemTime(new Date("2026-04-29T12:00:00+02:00"));
      _test.setState({
        allStations: {
          ns: {
            station: {
              uid: "station",
              id: "1",
              name: "Stop",
              lines: ["1"],
            },
          },
        },
        cacheMeta: { ns: { loadedAt: Date.now() } },
      });
      _test.setHttpClient({
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          status: 200,
          data: [{ station_id: "station", departure_time: ["08:00", "18:00"] }],
        }),
      });

      const response = await fastify.inject({
        method: "GET",
        url: `/api/stations/ns/schedule?uid=station&date=${date}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().schedule["1"]).toEqual(["08:00", "18:00"]);
    },
  );

  it("bounds timetable concurrency and deduplicates station lines", async () => {
    _test.setState({
      allStations: {
        ns: {
          station: {
            uid: "station",
            id: "1",
            name: "Stop",
            lines: ["1", "1", "2", "3", "4", "5"],
          },
        },
      },
      cacheMeta: { ns: { loadedAt: Date.now() } },
    });
    let active = 0;
    let maximum = 0;
    const post = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { status: 200, data: [] };
    });
    _test.setHttpClient({ get: vi.fn(), post });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/ns/schedule?uid=station&date=2026-04-29",
    });

    expect(response.statusCode).toBe(200);
    expect(post).toHaveBeenCalledTimes(10);
    expect(maximum).toBeLessThanOrEqual(6);
    expect(response.json().schedule).toEqual({});
  });

  it("proxies route requests to OSRM", async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          code: "Ok",
          routes: [{ geometry: { type: "LineString", coordinates: [] } }],
        },
      }),
      post: vi.fn(),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({
      method: "GET",
      url: "/api/route?coords=20.1,44.1%3B20.2,44.2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      code: "Ok",
      routes: [{ geometry: { type: "LineString", coordinates: [] } }],
    });
    expect(httpClient.get).toHaveBeenCalledWith(
      "https://router.project-osrm.org/route/v1/driving/20.1,44.1;20.2,44.2?overview=full&geometries=geojson",
      { timeout: 10000 },
    );
  });

  it("returns 400 for invalid route coords", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/route?coords=not-a-coordinate",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("must match pattern");
  });

  it("returns 502 when OSRM fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    _test.setHttpClient({
      get: vi.fn().mockRejectedValue(new Error("network failed")),
      post: vi.fn(),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/route?coords=20.1,44.1%3B20.2,44.2",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "OSRM request failed" });
  });
});
