import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { resetHttpClient, setHttpClient } = require("../server/httpClient.js");
const {
  getBelgradeStop,
  getBelgradeRoute,
  getBelgradeVehicles,
  belgradeStops,
  _test,
} = require("../server/services/yandexBelgradeService.js");

describe("Belgrade stop catalog", () => {
  it("validates and exports the Yandex transit catalog", () => {
    const source = require("../server/data/yandex-belgrade-bus-stops.json");
    expect(belgradeStops).toBe(source);
    expect(belgradeStops.stops).toHaveLength(2125);
    expect(belgradeStops.routes).toHaveLength(92);
    expect(
      Object.fromEntries(
        ["bus", "tram", "minibus", "trolleybus"].map((type) => [
          type,
          belgradeStops.routes.filter((route) => route.type === type).length,
        ]),
      ),
    ).toEqual({ bus: 77, tram: 9, minibus: 3, trolleybus: 3 });
    const routeNames = new Set(belgradeStops.routes.map(({ route }) => route));
    expect(
      belgradeStops.stops.every(
        ({ routes }) =>
          routes.length > 0 &&
          routes.every((route) =>
            routeNames.has(route.replace(/^(?:tram|minibus|trolleybus):/, "")),
          ),
      ),
    ).toBe(true);
    expect(belgradeStops.routes).toContainEqual(
      expect.objectContaining({
        route: "511",
        lineId: "4206130163",
        type: "bus",
      }),
    );
    expect(belgradeStops.remainingRoutes).toEqual([]);
    expect(belgradeStops.complete).toBe(false);
  });

  it("rejects duplicate IDs and invalid coordinates", () => {
    const stop = { id: "1", name: "Stop", coords: [44.8, 20.4] };
    expect(() =>
      _test.validateStops({ updatedAt: "2026-10-26", stops: [stop, stop] }),
    ).toThrow();
    expect(() =>
      _test.validateStops({
        updatedAt: "2026-10-26",
        stops: [{ ...stop, coords: [0, 0] }],
      }),
    ).toThrow();
  });
});

const stopState = {
  config: {
    masstransitStop: {
      id: "6739029064",
      name: "Стадион Партизан · 278",
      coordinates: [20.4577, 44.786],
      transports: [
        {
          name: "40",
          lineId: "1704912322",
          uri: "ymapsbm1://transit/line?id=1704912322&name=40&type=trolleybus",
          seoname: "40",
          type: "trolleybus",
          threads: [
            {
              threadId: "4898716406",
              EssentialStops: [{ name: "Banjica 2" }, { name: "Звездара" }],
              BriefSchedule: {
                Events: [
                  {
                    Scheduled: { value: "1792943111" },
                    Estimated: { value: "1792943178" },
                    vehicleId: "belgrade|P82023",
                  },
                  { Scheduled: { value: "1792943711" } },
                ],
              },
            },
          ],
        },
      ],
    },
  },
};
const stopHtml = `<script type="application/json" class="state-view">${JSON.stringify(stopState)}</script>`;

afterEach(() => {
  resetHttpClient();
  _test.resetCache();
  vi.useRealTimers();
});

const routeState = {
  config: {
    csrfToken: "csrf-token",
    realLocale: "en_RS",
    lang: "en",
    counters: { analytics: { sessionId: "session-id" } },
    masstransitLine: {
      features: [
        {
          properties: {
            ThreadMetaData: {
              id: "4898716406",
              lineId: "1704912322",
              name: "40",
              type: "trolleybus",
            },
          },
          features: [
            { id: "1", name: "Бањица", coordinates: [20.4, 44.7] },
            {
              points: [
                [20.4, 44.7],
                [20.41, 44.71],
                [20.42, 44.72],
              ],
            },
            { id: "2", name: "Звездара", coordinates: [20.42, 44.72] },
          ],
        },
      ],
    },
  },
};
const routeHtml = (data = routeState) =>
  `<script type="application/json" class="state-view">${JSON.stringify(data)}</script>`;

describe("Yandex Belgrade routes", () => {
  it("parses matching direction with Latin stops and provider geometry", () => {
    expect(
      _test.parseRoutePage(routeHtml(), "1704912322", "4898716406"),
    ).toEqual({
      lineId: "1704912322",
      threadId: "4898716406",
      name: "40",
      stops: [
        { id: "1", name: "Banjica", coords: [44.7, 20.4] },
        { id: "2", name: "Zvezdara", coords: [44.72, 20.42] },
      ],
      type: "trolleybus",
      segments: [
        [
          [44.7, 20.4],
          [44.71, 20.41],
          [44.72, 20.42],
        ],
      ],
    });
  });

  it("parses validated live positions and ignores invalid coordinates or other lines", () => {
    const vehicles = _test.parseVehiclePositions(
      {
        vehicles: [
          {
            properties: {
              VehicleMetaData: {
                id: "belgrade|P82023",
                Transport: { lineId: "1704912322", name: "40" },
              },
            },
            features: [
              {
                geometry: {
                  coordinates: [
                    [20.41, 44.71],
                    [20.42, 44.72],
                  ],
                },
              },
            ],
          },
          {
            properties: {
              VehicleMetaData: {
                id: "belgrade|P2",
                Transport: { lineId: "other", name: "41" },
              },
            },
            features: [{ geometry: { coordinates: [[20.4, 44.7]] } }],
          },
          {
            properties: {
              VehicleMetaData: {
                id: "belgrade|P3",
                Transport: { lineId: "1704912322", name: "40" },
              },
            },
            features: [{ geometry: { coordinates: [[200, 44.7]] } }],
          },
        ],
      },
      "1704912322",
    );
    expect(vehicles).toEqual([
      { id: "belgrade|P82023", lineNumber: "40", coords: [44.71, 20.41] },
    ]);
    expect(() => _test.parseVehiclePositions({}, "1704912322")).toThrow();
  });

  it("keeps only live vehicles expected at the stop", async () => {
    const position = {
      properties: {
        VehicleMetaData: {
          id: "belgrade|P82023",
          Transport: { lineId: "1704912322", name: "40" },
        },
      },
      features: [{ geometry: { coordinates: [[20.41, 44.71]] } }],
    };
    const otherVehicle = {
      properties: {
        VehicleMetaData: {
          id: "belgrade|P82099",
          Transport: { lineId: "1704912322", name: "40" },
        },
      },
      features: [{ geometry: { coordinates: [[20.42, 44.72]] } }],
    };
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: stopHtml,
        headers: { "set-cookie": ["yandexuid=opaque; Path=/"] },
      })
      .mockResolvedValueOnce({ status: 200, data: routeHtml() })
      .mockResolvedValueOnce({
        status: 200,
        data: { data: { vehicles: [position, otherVehicle] } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { data: { vehicles: [position] } },
      });
    setHttpClient({ get });

    await expect(getBelgradeVehicles("6739029064")).resolves.toEqual({
      vehicles: [
        { id: "belgrade|P82023", lineNumber: "40", coords: [44.71, 20.41] },
      ],
    });
    await expect(getBelgradeVehicles("6739029064")).resolves.toEqual({
      vehicles: [
        { id: "belgrade|P82023", lineNumber: "40", coords: [44.71, 20.41] },
      ],
    });
    expect(get).toHaveBeenCalledTimes(4);
    const [url, options] = get.mock.calls[2];
    expect(url).toContain("/maps/api/masstransit/getVehiclesInfoWithRegion?");
    expect(new URL(url).searchParams.get("lineId")).toBe("1704912322");
    expect(options.headers).toMatchObject({
      Accept: "application/json",
      "User-Agent": "SerbiaTransport/1.0",
      Cookie: "yandexuid=opaque",
      "X-Retpath-Y": expect.stringContaining("/maps/10522/belgrade/routes/"),
    });
    expect(get.mock.calls[1][1].headers).toMatchObject({
      Accept: "text/html",
      "User-Agent": "SerbiaTransport/1.0",
      Cookie: "yandexuid=opaque",
    });
  });

  it("returns vehicles from successful routes when another route request fails", async () => {
    const partialState = structuredClone(stopState);
    const firstTransport = partialState.config.masstransitStop.transports[0];
    const secondTransport = structuredClone(firstTransport);
    secondTransport.name = "41";
    secondTransport.lineId = "1704912323";
    secondTransport.uri =
      "ymapsbm1://transit/line?id=1704912323&name=41&type=bus";
    secondTransport.seoname = "41";
    secondTransport.type = "bus";
    secondTransport.threads[0].threadId = "4898716407";
    secondTransport.threads[0].BriefSchedule.Events[0].vehicleId =
      "belgrade|P82024";
    partialState.config.masstransitStop.transports.push(secondTransport);

    const get = vi.fn(async (url) => {
      if (url.includes("/stops/"))
        return {
          status: 200,
          data: `<script type="application/json" class="state-view">${JSON.stringify(partialState)}</script>`,
        };
      if (url.includes("/routes/")) {
        const state = structuredClone(routeState);
        const isSecond = url.includes("bus_41");
        const metadata =
          state.config.masstransitLine.features[0].properties.ThreadMetaData;
        metadata.lineId = isSecond ? "1704912323" : "1704912322";
        metadata.id = isSecond ? "4898716407" : "4898716406";
        return { status: 200, data: routeHtml(state) };
      }
      const lineId = new URL(url).searchParams.get("lineId");
      if (lineId === "1704912322") throw new Error("route feed unavailable");
      return {
        status: 200,
        data: {
          data: {
            vehicles: [
              {
                properties: {
                  VehicleMetaData: {
                    id: "belgrade|P82024",
                    Transport: { lineId, name: "41" },
                  },
                },
                features: [{ geometry: { coordinates: [[20.42, 44.72]] } }],
              },
            ],
          },
        },
      };
    });
    setHttpClient({ get });

    await expect(getBelgradeVehicles("6739029064")).resolves.toEqual({
      vehicles: [
        { id: "belgrade|P82024", lineNumber: "41", coords: [44.72, 20.42] },
      ],
    });
  });

  it("maps upstream HTTP failures to gateway errors for both request types", async () => {
    const pageFailure = vi
      .fn()
      .mockRejectedValue(new Error("page unavailable"));
    setHttpClient({ get: pageFailure });
    await expect(getBelgradeStop("6739029064")).rejects.toMatchObject({
      statusCode: 502,
    });

    const vehicleFailure = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, data: stopHtml })
      .mockResolvedValueOnce({ status: 200, data: routeHtml() })
      .mockRejectedValueOnce(new Error("vehicles unavailable"));
    setHttpClient({ get: vehicleFailure });
    await expect(getBelgradeVehicles("6739029064")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects incomplete live-position responses after refreshing CSRF token", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, data: stopHtml })
      .mockResolvedValueOnce({ status: 200, data: routeHtml() })
      .mockResolvedValueOnce({
        status: 200,
        data: { csrfToken: "fresh-token" },
        headers: { "set-cookie": ["challenge=updated; Path=/"] },
      })
      .mockResolvedValueOnce({ status: 200, data: { blocked: true } });
    setHttpClient({ get });

    await expect(getBelgradeVehicles("6739029064")).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(new URL(get.mock.calls[3][0]).searchParams.get("csrfToken")).toBe(
      "fresh-token",
    );
    expect(get.mock.calls[3][1].headers).toMatchObject({
      Accept: "application/json",
      "User-Agent": "SerbiaTransport/1.0",
      Cookie: "challenge=updated",
      "X-Retpath-Y": expect.stringContaining("/maps/10522/belgrade/routes/"),
    });
  });

  it("rejects wrong direction, invalid geometry and CAPTCHA", () => {
    expect(() =>
      _test.parseRoutePage(routeHtml(), "1704912322", "wrong"),
    ).toThrow();
    const invalid = structuredClone(routeState);
    invalid.config.masstransitLine.features[0].features[1].points[0] = [
      200, 90,
    ];
    expect(() =>
      _test.parseRoutePage(routeHtml(invalid), "1704912322", "4898716406"),
    ).toThrow();
    expect(() =>
      _test.parseRoutePage("<html>captcha</html>", "1704912322", "4898716406"),
    ).toThrow();
  });

  it("only fetches routes from stop metadata and deduplicates cached requests", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, data: stopHtml })
      .mockResolvedValue({ status: 200, data: routeHtml() });
    setHttpClient({ get });
    await Promise.all([
      getBelgradeRoute("1704912322", "4898716406", "6739029064"),
      getBelgradeRoute("1704912322", "4898716406", "6739029064"),
    ]);
    await getBelgradeRoute("1704912322", "4898716406", "6739029064");
    expect(get).toHaveBeenCalledTimes(2);
    const uri = stopState.config.masstransitStop.transports[0].uri;
    expect(get.mock.calls[1][0]).toBe(
      `https://yandex.com/maps/10522/belgrade/routes/trolleybus_40/${Buffer.from(uri).toString("hex")}/`,
    );
    await expect(
      getBelgradeRoute("123", "456", "6739029064"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not cache upstream failures or serve expired route geometry", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const get = vi.fn().mockImplementation((url) =>
      Promise.resolve({
        status: 200,
        data: url.includes("/stops/") ? stopHtml : routeHtml(),
      }),
    );
    setHttpClient({ get });
    await getBelgradeRoute("1704912322", "4898716406", "6739029064");
    vi.setSystemTime(now + 300_001);
    get.mockImplementation((url) =>
      url.includes("/stops/")
        ? Promise.resolve({ status: 200, data: stopHtml })
        : Promise.reject(new Error("unavailable")),
    );
    await expect(
      getBelgradeRoute("1704912322", "4898716406", "6739029064"),
    ).rejects.toMatchObject({ statusCode: 502 });
    await expect(
      getBelgradeRoute("1704912322", "4898716406", "6739029064"),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(
      get.mock.calls.filter(([url]) => url.includes("/routes/")),
    ).toHaveLength(3);
  });
});

describe("Yandex Belgrade stop page", () => {
  it("builds tramway route references from stop metadata", () => {
    const tramState = structuredClone(stopState);
    Object.assign(tramState.config.masstransitStop.transports[0], {
      name: "14",
      lineId: "1704914690",
      uri: "ymapsbm1://transit/line?id=1704914690&name=14&type=tramway",
      seoname: "14",
      type: "tramway",
    });
    const arrival = _test.parseStopPage(routeHtml(tramState), "6739029064")
      .arrivals[0];
    expect(arrival.route).toEqual({
      lineId: "1704914690",
      threadId: "4898716406",
      path: `/maps/10522/belgrade/routes/tramway_14/${Buffer.from(tramState.config.masstransitStop.transports[0].uri).toString("hex")}/`,
    });
  });

  it("builds minibus route references from stop metadata", () => {
    const minibusState = structuredClone(stopState);
    Object.assign(minibusState.config.masstransitStop.transports[0], {
      name: "Е6",
      lineId: "4664663654",
      uri: "ymapsbm1://transit/line?id=4664663654&ll=20.429671%2C44.790000&name=E6&r=12000&type=minibus",
      seoname: "E6",
      type: "minibus",
    });
    const arrival = _test.parseStopPage(routeHtml(minibusState), "6739029064")
      .arrivals[0];
    expect(arrival.route).toEqual({
      lineId: "4664663654",
      threadId: "4898716406",
      path: `/maps/10522/belgrade/routes/minibus_E6/${Buffer.from(minibusState.config.masstransitStop.transports[0].uri).toString("hex")}/`,
    });
  });

  it("normalizes Latin names and scheduled-only times", () => {
    expect(_test.parseStopPage(stopHtml, "6739029064")).toEqual({
      city: "bg",
      name: "Stadion Partizan · 278",
      uid: "6739029064",
      id: "6739029064",
      coords: [44.786, 20.4577],
      arrivals: [
        {
          lineNumber: "40",
          transportType: "trolleybus",
          destination: "Zvezdara",
          scheduledAt: "2026-10-25T15:45:11.000Z",
          estimatedAt: "2026-10-25T15:46:18.000Z",
          vehicleId: "belgrade|P82023",
          isEstimated: true,
          route: expect.objectContaining({
            lineId: "1704912322",
            threadId: "4898716406",
          }),
        },
        {
          lineNumber: "40",
          transportType: "trolleybus",
          destination: "Zvezdara",
          scheduledAt: "2026-10-25T15:55:11.000Z",
          estimatedAt: null,
          vehicleId: null,
          isEstimated: false,
          route: expect.objectContaining({
            lineId: "1704912322",
            threadId: "4898716406",
          }),
        },
      ],
    });
  });

  it("transliterates Serbian digraphs and diacritics", () => {
    expect(
      _test.toLatin("Ђорђе Љубавић, Његош, Џакарта, Шабац, Чукаричка падина"),
    ).toBe("Đorđe Ljubavić, Njegoš, Džakarta, Šabac, Čukarička padina");
  });

  it.each([
    ["missing state", "<html>captcha</html>"],
    [
      "invalid JSON",
      '<script type="application/json" class="state-view">{</script>',
    ],
    ["wrong stop", stopHtml.replace("6739029064", "1")],
  ])("rejects %s", (_label, html) => {
    expect(() => _test.parseStopPage(html, "6739029064")).toThrow();
  });

  it("caches results for 30 seconds and deduplicates concurrent requests", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-25T16:00:00.000Z");
    vi.setSystemTime(now);
    const get = vi.fn().mockResolvedValue({ status: 200, data: stopHtml });
    setHttpClient({ get });

    const responses = await Promise.all([
      getBelgradeStop("6739029064"),
      getBelgradeStop("6739029064"),
    ]);
    expect(responses[0]).toEqual(responses[1]);
    await getBelgradeStop("6739029064");
    expect(get).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(now.getTime() + 30_000));
    await getBelgradeStop("6739029064");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not serve expired cached arrivals after upstream failure", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-25T16:00:00.000Z");
    vi.setSystemTime(now);
    setHttpClient({
      get: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, data: stopHtml })
        .mockRejectedValueOnce(new Error("Yandex unavailable")),
    });

    await getBelgradeStop("6739029064");
    vi.setSystemTime(new Date(now.getTime() + 30_000));
    await expect(getBelgradeStop("6739029064")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("fetches fixed public stop page only", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, data: stopHtml });
    setHttpClient({ get });

    await expect(getBelgradeStop("6739029064")).resolves.toMatchObject({
      uid: "6739029064",
    });
    expect(get).toHaveBeenCalledWith(
      "https://yandex.com/maps/10522/belgrade/stops/6739029064/",
      expect.objectContaining({
        timeout: 5000,
        maxContentLength: 1_000_000,
        responseType: "text",
        headers: { Accept: "text/html", "User-Agent": "SerbiaTransport/1.0" },
      }),
    );
  });

  it("rejects HTML block pages instead of treating them as stop data", async () => {
    setHttpClient({
      get: vi
        .fn()
        .mockResolvedValue({ status: 200, data: "<html>captcha</html>" }),
    });

    await expect(getBelgradeStop("6739029064")).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
