import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { getStations, openDatabase, syncCity } from "./storage.js";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("station catalog sync", () => {
  it("uses the versioned Belgrade stop catalog", async () => {
    const calls = [];
    const stations = await syncCity("bg", async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({
          updatedAt: "2025-01-01T00:00:00Z",
          stops: [{ id: 42, name: "Centar", coords: [44.8, 20.4] }],
        }),
      };
    });

    expect(calls).toEqual(["/api/bg/stops"]);
    expect(stations).toEqual([
      {
        city: "bg",
        id: "42",
        uid: "42",
        name: "Centar",
        lat: 44.8,
        lon: 20.4,
      },
    ]);
  });

  it("replaces cached Belgrade stops when the catalog version changes", async () => {
    const catalogs = [
      {
        updatedAt: "v1",
        stops: [{ id: 42, name: "Old name", coords: [44.8, 20.4] }],
      },
      {
        updatedAt: "v2",
        stops: [{ id: 42, name: "Correct name", coords: [44.8, 20.4] }],
      },
    ];
    const fetchCatalog = async () => ({
      ok: true,
      json: async () => catalogs.shift(),
    });

    await syncCity("bg", fetchCatalog);
    const stations = await syncCity("bg", fetchCatalog);

    expect(stations.map(({ name }) => name)).toEqual(["Correct name"]);
  });

  it("preserves the alerts store while upgrading the database", async () => {
    const database = await openDatabase();
    expect(database.objectStoreNames.contains("alerts")).toBe(true);
    expect(database.objectStoreNames.contains("favorites")).toBe(true);
    database.close();
  });

  it("keeps cached stations when hash check fails", async () => {
    const responses = [
      { ok: true, json: async () => ({ hash: "v1" }) },
      {
        ok: true,
        json: async () => ({
          uid1: { id: "1", name: "First", coords: [45, 19] },
        }),
      },
      { ok: true, json: async () => ({ hash: "v2" }) },
    ];
    await syncCity("ns", async () => responses.shift());
    const cached = await syncCity("ns", async () => {
      throw new Error("offline");
    });
    expect(cached.map(({ id }) => id)).toEqual(["1"]);
    expect(await getStations("ns")).toEqual(cached);
  });

  it("replaces cached rows only after a complete catalog download", async () => {
    const setup = [
      { ok: true, json: async () => ({ hash: "v1" }) },
      {
        ok: true,
        json: async () => ({ a: { id: "1", name: "Old", coords: [45, 19] } }),
      },
    ];
    await syncCity("ns", async () => setup.shift());

    await expect(
      syncCity("ns", async (url) =>
        url.endsWith("/hash")
          ? { ok: true, json: async () => ({ hash: "v2" }) }
          : { ok: false, status: 503 },
      ),
    ).rejects.toThrow("Station download failed: 503");
    expect((await getStations("ns")).map(({ name }) => name)).toEqual(["Old"]);
  });
});
