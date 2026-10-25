import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resetHttpClient, setHttpClient } = require("../server/httpClient.js");
const { getBelgradeStop, getBelgradeRoute, _test } = require("../server/services/yandexBelgradeService.js");

const stopState = {
  config: {
    masstransitStop: {
      id: "3833919270",
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
  config: { masstransitLine: { features: [{
    properties: { ThreadMetaData: { id: "4898716406", lineId: "1704912322", name: "40" } },
    features: [
      { id: "1", name: "Бањица", coordinates: [20.4, 44.7] },
      { points: [[20.4, 44.7], [20.41, 44.71], [20.42, 44.72]] },
      { id: "2", name: "Звездара", coordinates: [20.42, 44.72] },
    ],
  }] } },
};
const routeHtml = (data = routeState) => `<script type="application/json" class="state-view">${JSON.stringify(data)}</script>`;

describe("Yandex Belgrade routes", () => {
  it("parses matching direction with Latin stops and provider geometry", () => {
    expect(_test.parseRoutePage(routeHtml(), "1704912322", "4898716406")).toEqual({
      lineId: "1704912322", threadId: "4898716406", name: "40",
      stops: [
        { id: "1", name: "Banjica", coords: [44.7, 20.4] },
        { id: "2", name: "Zvezdara", coords: [44.72, 20.42] },
      ],
      segments: [[[44.7, 20.4], [44.71, 20.41], [44.72, 20.42]]],
    });
  });

  it("rejects wrong direction, invalid geometry and CAPTCHA", () => {
    expect(() => _test.parseRoutePage(routeHtml(), "1704912322", "wrong")).toThrow();
    const invalid = structuredClone(routeState);
    invalid.config.masstransitLine.features[0].features[1].points[0] = [200, 90];
    expect(() => _test.parseRoutePage(routeHtml(invalid), "1704912322", "4898716406")).toThrow();
    expect(() => _test.parseRoutePage("<html>captcha</html>", "1704912322", "4898716406")).toThrow();
  });

  it("only fetches routes from stop metadata and deduplicates cached requests", async () => {
    const get = vi.fn().mockResolvedValueOnce({ status: 200, data: stopHtml })
      .mockResolvedValue({ status: 200, data: routeHtml() });
    setHttpClient({ get });
    await Promise.all([getBelgradeRoute("1704912322", "4898716406"), getBelgradeRoute("1704912322", "4898716406")]);
    await getBelgradeRoute("1704912322", "4898716406");
    expect(get).toHaveBeenCalledTimes(2);
    const uri = stopState.config.masstransitStop.transports[0].uri;
    expect(get.mock.calls[1][0]).toBe(`https://yandex.com/maps/10522/belgrade/routes/trolleybus_40/${Buffer.from(uri).toString("hex")}/`);
    await expect(getBelgradeRoute("123", "456")).rejects.toMatchObject({ statusCode: 404 });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not cache upstream failures or serve expired route geometry", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const get = vi.fn().mockImplementation((url) => Promise.resolve({ status: 200, data: url.includes("/stops/") ? stopHtml : routeHtml() }));
    setHttpClient({ get });
    await getBelgradeRoute("1704912322", "4898716406");
    vi.setSystemTime(now + 300_001);
    get.mockImplementation((url) => url.includes("/stops/") ? Promise.resolve({ status: 200, data: stopHtml }) : Promise.reject(new Error("unavailable")));
    await expect(getBelgradeRoute("1704912322", "4898716406")).rejects.toMatchObject({ statusCode: 502 });
    await expect(getBelgradeRoute("1704912322", "4898716406")).rejects.toMatchObject({ statusCode: 502 });
    expect(get.mock.calls.filter(([url]) => url.includes("/routes/"))).toHaveLength(3);
  });
});

describe("Yandex Belgrade stop page", () => {
  it("normalizes Latin names and scheduled-only times", () => {
    expect(_test.parseStopPage(stopHtml)).toEqual({
      city: "bg",
      name: "Stadion Partizan · 278",
      uid: "3833919270",
      id: "3833919270",
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
          route: expect.objectContaining({ lineId: "1704912322", threadId: "4898716406" }),
        },
        {
          lineNumber: "40",
          transportType: "trolleybus",
          destination: "Zvezdara",
          scheduledAt: "2026-10-25T15:55:11.000Z",
          estimatedAt: null,
          vehicleId: null,
          isEstimated: false,
          route: expect.objectContaining({ lineId: "1704912322", threadId: "4898716406" }),
        },
      ],
    });
  });

  it("transliterates Serbian digraphs and diacritics", () => {
    expect(_test.toLatin("Ђорђе Љубавић, Његош, Џакарта, Шабац, Чукаричка падина"))
      .toBe("Đorđe Ljubavić, Njegoš, Džakarta, Šabac, Čukarička padina");
  });

  it.each([
    ["missing state", "<html>captcha</html>"],
    ["invalid JSON", '<script type="application/json" class="state-view">{</script>'],
    ["wrong stop", stopHtml.replace("3833919270", "1")],
  ])("rejects %s", (_label, html) => {
    expect(() => _test.parseStopPage(html)).toThrow();
  });

  it("caches results for 30 seconds and deduplicates concurrent requests", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-25T16:00:00.000Z");
    vi.setSystemTime(now);
    const get = vi.fn().mockResolvedValue({ status: 200, data: stopHtml });
    setHttpClient({ get });

    const responses = await Promise.all([getBelgradeStop(), getBelgradeStop()]);
    expect(responses[0]).toEqual(responses[1]);
    await getBelgradeStop();
    expect(get).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(now.getTime() + 30_000));
    await getBelgradeStop();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not serve expired cached arrivals after upstream failure", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-25T16:00:00.000Z");
    vi.setSystemTime(now);
    setHttpClient({
      get: vi.fn()
        .mockResolvedValueOnce({ status: 200, data: stopHtml })
        .mockRejectedValueOnce(new Error("Yandex unavailable")),
    });

    await getBelgradeStop();
    vi.setSystemTime(new Date(now.getTime() + 30_000));
    await expect(getBelgradeStop()).rejects.toMatchObject({ statusCode: 502 });
  });

  it("fetches fixed public stop page only", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, data: stopHtml });
    setHttpClient({ get });

    await expect(getBelgradeStop()).resolves.toMatchObject({ uid: "3833919270" });
    expect(get).toHaveBeenCalledWith(
      "https://yandex.com/maps/10522/belgrade/stops/3833919270/",
      expect.objectContaining({
        timeout: 5000,
        maxContentLength: 1_000_000,
        responseType: "text",
        headers: { Accept: "text/html", "User-Agent": "SerbiaTransport/1.0" },
      }),
    );
  });

  it("rejects HTML block pages instead of treating them as stop data", async () => {
    setHttpClient({ get: vi.fn().mockResolvedValue({ status: 200, data: "<html>captcha</html>" }) });

    await expect(getBelgradeStop()).rejects.toMatchObject({ statusCode: 502 });
  });
});
