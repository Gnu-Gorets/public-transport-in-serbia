import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resetHttpClient, setHttpClient } = require("../server/httpClient.js");
const { getBelgradeStop, _test } = require("../server/services/yandexBelgradeService.js");

const stopState = {
  config: {
    masstransitStop: {
      id: "3833919270",
      name: "Стадион Партизан · 278",
      coordinates: [20.4577, 44.786],
      transports: [
        {
          name: "40",
          type: "trolleybus",
          threads: [
            {
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
        },
        {
          lineNumber: "40",
          transportType: "trolleybus",
          destination: "Zvezdara",
          scheduledAt: "2026-10-25T15:55:11.000Z",
          estimatedAt: null,
          vehicleId: null,
          isEstimated: false,
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
        headers: { Accept: "text/html" },
      }),
    );
  });

  it("rejects HTML block pages instead of treating them as stop data", async () => {
    setHttpClient({ get: vi.fn().mockResolvedValue({ status: 200, data: "<html>captcha</html>" }) });

    await expect(getBelgradeStop()).rejects.toMatchObject({ statusCode: 502 });
  });
});
