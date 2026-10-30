// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { load } from "./+page.server";

afterEach(() => vi.unstubAllGlobals());

describe("home page server load", () => {
  it("renders default Belgrade stops", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        stops: [{ id: "1", name: "Stop", coords: [45, 20] }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const setHeaders = vi.fn();

    const data = await load({
      cookies: { get: () => undefined },
      setHeaders,
      url: new URL("http://localhost/"),
    } as unknown as Parameters<typeof load>[0]);

    expect(data).toEqual({
      cities: { bg: "Belgrade" },
      city: "bg",
      stations: [
        {
          id: "1",
          uid: "1",
          name: "Stop",
          coords: [45, 20],
          lines: [],
        },
      ],
      error: "",
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:3001/api/bg/stops",
    ]);
    expect(setHeaders).toHaveBeenCalledWith({
      "cache-control": "private, no-store",
    });
  });

  it("reports empty station catalogs instead of rendering loading forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(Response.json({ stops: [] })),
    );

    const data = await load({
      cookies: { get: () => undefined },
      setHeaders: vi.fn(),
      url: new URL("http://localhost/"),
    } as unknown as Parameters<typeof load>[0]);

    expect(data).toMatchObject({
      stations: [],
      error: "No stations available.",
    });
  });

  it("limits and sorts server-rendered initial slice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        Response.json({
          stops: Array.from({ length: 41 }, (_, id) => ({
            id: String(id),
            name: `Stop ${40 - id}`,
            coords: [45, 20],
          })),
        }),
      ),
    );

    const data = (await load({
      cookies: { get: () => undefined },
      setHeaders: vi.fn(),
      url: new URL("http://localhost/"),
    } as unknown as Parameters<typeof load>[0])) as Exclude<
      Awaited<ReturnType<typeof load>>,
      void
    >;

    expect(data.stations).toHaveLength(40);
    expect(data.stations[0].name).toBe("Stop 0");
    expect(data.stations.at(-1)?.name).toBe("Stop 39");
  });

  it("loads selected city if city discovery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Cities unavailable"))
        .mockResolvedValueOnce(
          Response.json({
            "station-1": {
              id: 12,
              name: "Novi Sad Stop",
              coords: [45.2, 19.8],
            },
          }),
        ),
    );

    const data = await load({
      cookies: { get: () => "ns" },
      setHeaders: vi.fn(),
      url: new URL("http://localhost/"),
    } as unknown as Parameters<typeof load>[0]);

    expect(data).toMatchObject({
      city: "ns",
      stations: [{ id: "12", uid: "station-1", name: "Novi Sad Stop" }],
      error: "",
    });
  });

  it("falls back to available city when cookie is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ bg: "Belgrade", ns: "Novi Sad" }),
        )
        .mockResolvedValueOnce(
          Response.json({
            stops: [{ id: "1", name: "Stop", coords: [45, 20] }],
          }),
        ),
    );

    const data = await load({
      cookies: { get: () => "unknown" },
      setHeaders: vi.fn(),
      url: new URL("http://localhost/"),
    } as unknown as Parameters<typeof load>[0]);

    expect(data).toMatchObject({ city: "bg" });
  });

  it("loads city selected by cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ bg: "Belgrade", ns: "Novi Sad" }),
        )
        .mockResolvedValueOnce(
          Response.json({
            "station-1": {
              id: 12,
              name: "Novi Sad Stop",
              coords: [45.2, 19.8],
              lines: ["7"],
            },
          }),
        ),
    );

    const data = await load({
      cookies: { get: () => "ns" },
      setHeaders: vi.fn(),
      url: new URL("http://localhost/"),
    } as unknown as Parameters<typeof load>[0]);

    expect(data).toMatchObject({
      city: "ns",
      stations: [
        {
          id: "12",
          uid: "station-1",
          name: "Novi Sad Stop",
          coords: [45.2, 19.8],
          lines: ["7"],
        },
      ],
    });
  });
});
