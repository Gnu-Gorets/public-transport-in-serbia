import type { PageServerLoad } from "./$types";
import {
  INITIAL_STATION_COUNT,
  sortStations,
  type Station,
} from "#lib/stations.ts";

export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store" });
  const apiPort = import.meta.env.DEV ? 3001 : Number(process.env.PORT || 3000);
  const origin = `http://127.0.0.1:${apiPort}`;
  let cities: Record<string, string> = { bg: "Belgrade" };
  let city = cookies.get("bgpp-city") || "bg";
  let stations: Station[] = [];
  let error = "";

  if (city !== "bg") {
    try {
      const citiesResponse = await globalThis.fetch(
        new URL("/api/cities", origin),
      );
      if (citiesResponse.ok) {
        cities = await citiesResponse.json();
        if (!Object.hasOwn(cities, city)) city = Object.keys(cities)[0] || "bg";
      }
    } catch {
      // Keep selected city when city discovery is temporarily unavailable.
    }
  }

  try {
    const path =
      city === "bg"
        ? "/api/bg/stops"
        : `/api/stations/${encodeURIComponent(city)}/all`;
    const response = await globalThis.fetch(new URL(path, origin));
    if (!response.ok)
      throw new Error(`Station download failed: ${response.status}`);
    const catalog = await response.json();
    stations =
      city === "bg"
        ? catalog.stops.map(
            ({
              id,
              name,
              coords,
            }: {
              id: string;
              name: string;
              coords: [number, number];
            }) => ({
              id,
              uid: id,
              name,
              coords,
              lines: [],
            }),
          )
        : Object.entries(catalog).map(([uid, station]) => {
            const value = station as Omit<Station, "id" | "uid" | "lines"> & {
              id: string | number;
              uid?: string | number;
              lines?: string[];
            };
            return {
              ...value,
              id: String(value.id),
              uid: value.uid ?? uid,
              lines: value.lines || [],
            };
          });
    stations = sortStations(stations).slice(0, INITIAL_STATION_COUNT);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Unable to load stations.";
  }

  if (!stations.length && !error) error = "No stations available.";
  return { cities, city, stations, error };
};
