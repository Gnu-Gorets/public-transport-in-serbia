export type CityId = string;

export interface Cities {
  [cityId: string]: string;
}

export interface Station {
  name: string;
  uid: string | number;
  id: string;
  coords: [number, number];
  lines: string[];
}

interface RawStation {
  name: string;
  uid: string | number;
  id: string | number;
  coords: [number, number];
  lines?: string[];
}

export interface BelgradeStop {
  id: string;
  name: string;
  coords: [number, number];
  routes: string[];
}

export interface BelgradeStops {
  updatedAt: string;
  source: string;
  complete: boolean;
  routes: Array<{
    route: string;
    lineId: string;
    stopFeatures: number;
    type: string;
  }>;
  stops: BelgradeStop[];
}

export interface VehicleArrival {
  lineNumber: string | number;
  lineName: string;
  secondsLeft: string | number;
  stationsBetween: string | number;
  main_line_title: string;
  stationName?: string;
  garageNo?: string | number;
  coords: [number, number] | null;
  allStations: Array<{ latitude: number; longitude: number }>;
}

export interface StationArrivals {
  city: string;
  name?: string;
  uid: string | number;
  id: string | number;
  coords: [number, number];
  vehicles: VehicleArrival[];
}

export interface BelgradeArrival {
  lineNumber: string;
  transportType: string | null;
  destination: string | null;
  scheduledAt: string | null;
  estimatedAt: string | null;
  vehicleId: string | number | null;
  isEstimated: boolean;
  route: { lineId: string; threadId: string; path: string } | null;
}

export interface BelgradeVehicle {
  id: string;
  lineNumber: string;
  coords: [number, number];
}

export interface BelgradeStopArrivals {
  city: "bg";
  name: string;
  uid: string;
  id: string;
  coords: [number, number];
  arrivals: BelgradeArrival[];
}

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : response.statusText || "Request failed";
    throw new ApiError(response.status, message);
  }

  return body as T;
}

export function getCities(signal?: AbortSignal): Promise<Cities> {
  return request<Cities>("/api/cities", signal);
}

export async function getStations(
  city: CityId,
  signal?: AbortSignal,
): Promise<Station[]> {
  const response = await request<Record<string, RawStation>>(
    `/api/stations/${encodeURIComponent(city)}/all`,
    signal,
  );
  return Object.entries(response).map(([key, station]) => ({
    ...station,
    uid: station.uid ?? key,
    id: String(station.id),
    lines: station.lines || [],
  }));
}

export function getBelgradeStops(signal?: AbortSignal): Promise<BelgradeStops> {
  return request<BelgradeStops>("/api/bg/stops", signal);
}

export function getCatalogStopName(
  stops: BelgradeStop[],
  id: string,
  fallback = "",
): string {
  return stops.find((stop) => stop.id === id)?.name || fallback;
}

export type StationLookup = { uid: string } | { id: string };

export function getStationArrivals(
  city: CityId,
  station: StationLookup,
  signal?: AbortSignal,
): Promise<StationArrivals> {
  const query = new URLSearchParams(station);
  return request<StationArrivals>(
    `/api/stations/${encodeURIComponent(city)}/search?${query}`,
    signal,
  );
}

export function getBelgradeVehicles(
  stopId: string,
  signal?: AbortSignal,
): Promise<{ vehicles: BelgradeVehicle[] }> {
  const query = new URLSearchParams({ stopId });
  return request<{ vehicles: BelgradeVehicle[] }>(
    `/api/bg/vehicles?${query}`,
    signal,
  );
}

export function getBelgradeStopArrivals(
  stopId: string,
  signal?: AbortSignal,
): Promise<BelgradeStopArrivals> {
  const query = new URLSearchParams({ stopId });
  return request<BelgradeStopArrivals>(`/api/bg/stop?${query}`, signal);
}
