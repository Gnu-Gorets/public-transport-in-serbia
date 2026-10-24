import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import server from "../server/server.js";

const { fastify, _test } = server;

const stationsResponse = (name = "Main Station", id = "42", uid = "station-1") => ({
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
  });

  it("requires uid when requesting a station schedule", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/bg/schedule",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("must have required property 'uid'");
  });

  it("returns 404 when schedule station is unknown", async () => {
    _test.setState({
      allStations: {
        bg: {},
      },
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/bg/schedule?uid=missing&date=2026-04-29",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Station not found" });
  });

  it("returns 400 for invalid station search query", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/bg/search",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("must match a schema in anyOf");
  });

  it("returns 400 for unknown city params", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/unknown/all",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("must be equal to one of the allowed values");
  });

  it("returns 400 for invalid schedule date format", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/bg/schedule?uid=station-1&date=29-04-2026",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("must match pattern");
  });

  it("returns 400 when id search is requested before city map is populated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/bg/search?id=42",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Map for bg is not populated yet",
    });
  });

  it("returns 502 when station provider request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    _test.setHttpClient({
      get: vi.fn(),
      post: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/api/stations/bg/all",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "provider unavailable" });
  });

  it("uses fresh cached stations without calling provider", async () => {
    _test.setNow(() => 1_000);
    _test.setState({
      allStations: {
        bg: {
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
        bg: {
          "7_A": ["station-1"],
        },
      },
      cacheMeta: {
        bg: {
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
      url: "/api/stations/bg/all",
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

  it("refreshes expired station cache", async () => {
    _test.setNow(() => 2 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        bg: {
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
        bg: {
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
      url: "/api/stations/bg/all",
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
      "https://announcement-bgnaplata.ticketing.rs/publicapi/v1/networkextended.php",
      JSON.stringify({ action: "get_cities_extended" }),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("serves stale station cache while refreshing in background", async () => {
    _test.setNow(() => 2 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        bg: {
          "station-1": {
            uid: "station-1",
            id: "42",
            name: "Stale Station",
            coords: [44.8, 20.4],
            lines: ["7"],
          },
        },
      },
      cacheMeta: { bg: { loadedAt: 1_000 } },
    });
    let finishRefresh;
    const httpClient = {
      get: vi.fn(),
      post: vi.fn(() => new Promise((resolve) => { finishRefresh = resolve; })),
    };
    _test.setHttpClient(httpClient);

    const response = await fastify.inject({ method: "GET", url: "/api/stations/bg/all" });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0].name).toBe("Stale Station");
    expect(httpClient.post).toHaveBeenCalledOnce();
    finishRefresh({ status: 200, data: stationsResponse("Fresh Station", "42", "station-1") });
    await vi.waitFor(async () => {
      const refreshed = await fastify.inject({ method: "GET", url: "/api/stations/bg/all" });
      expect(refreshed.json()[0].name).toBe("Fresh Station");
    });
  });

  it("serves stale station cache when refresh fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    _test.setNow(() => 2 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: {
        bg: {
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
        bg: {
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
      url: "/api/stations/bg/all",
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
  });

  it("rejects expired station cache when refresh fails beyond the stale window", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    _test.setNow(() => 9 * 24 * 60 * 60 * 1000);
    _test.setState({
      allStations: { bg: { old: { uid: "old", id: "1", name: "Old Station", coords: [], lines: [] } } },
      cacheMeta: { bg: { loadedAt: 1_000 } },
    });
    _test.setHttpClient({ get: vi.fn(), post: vi.fn().mockRejectedValue(new Error("provider unavailable")) });

    const response = await fastify.inject({ method: "GET", url: "/api/stations/bg/all" });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "provider unavailable" });
  });

  it("builds a station schedule from timetable responses", async () => {
    _test.setState({
      allStations: {
        bg: {
          "station-1": {
            uid: "station-1",
            id: "42",
            name: "Main Station",
            lines: ["7"],
          },
        },
      },
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
      url: "/api/stations/bg/schedule?uid=station-1&date=2026-04-29",
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
