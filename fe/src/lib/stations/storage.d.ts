export interface StationRecord {
  city: string;
  id: string;
  uid: string | number;
  name: string;
  lat: number;
  lon: number;
}

export function openDatabase(): Promise<IDBDatabase>;
export function getStations(city: string): Promise<StationRecord[]>;
export function getFavorites(): Promise<StationRecord[]>;
export function setFavorite(
  station: StationRecord,
  favorite?: boolean,
): Promise<void>;
export function normalizeStations(
  city: string,
  payload: unknown,
): StationRecord[];
export function syncCity(city: string): Promise<StationRecord[]>;
