const DATABASE_NAME = "bgpp";
const DATABASE_VERSION = 3;
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("stations")) {
        const stations = database.createObjectStore("stations", {
          keyPath: ["city", "id"],
        });
        stations.createIndex("city", "city");
      }
      if (!database.objectStoreNames.contains("cityHashes"))
        database.createObjectStore("cityHashes", { keyPath: "city" });
      if (!database.objectStoreNames.contains("favorites"))
        database.createObjectStore("favorites", { keyPath: ["city", "id"] });
      if (!database.objectStoreNames.contains("alerts"))
        database.createObjectStore("alerts", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(storeNames, mode, action) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeNames, mode);
    const done = transactionDone(transaction);
    const result = await action(transaction);
    await done;
    return result;
  } finally {
    database.close();
  }
}

export async function getStations(city) {
  return transact(["stations"], "readonly", (transaction) =>
    requestResult(
      transaction.objectStore("stations").index("city").getAll(city),
    ),
  );
}

export async function getFavorites() {
  return transact(["favorites"], "readonly", (transaction) =>
    requestResult(transaction.objectStore("favorites").getAll()),
  );
}

export async function setFavorite(station, favorite = true) {
  return transact(["favorites"], "readwrite", (transaction) => {
    const store = transaction.objectStore("favorites");
    return favorite
      ? store.put(station)
      : store.delete([station.city, station.id]);
  });
}

export function normalizeStations(city, payload) {
  if (city === "bg") {
    if (!Array.isArray(payload?.stops)) throw new Error("Invalid stop catalog");
    return payload.stops.map(({ id, name, coords }) => ({
      city,
      id: String(id),
      uid: String(id),
      name,
      lat: coords[0],
      lon: coords[1],
    }));
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid station catalog");
  return Object.entries(payload).map(([uid, station]) => ({
    city,
    id: String(station.id),
    uid: station.uid ?? uid,
    name: station.name,
    lat: station.coords[0],
    lon: station.coords[1],
  }));
}

export async function syncCity(city, fetchImpl = globalThis.fetch) {
  const cached = await getStations(city);
  let catalog;
  let hash;
  try {
    if (city === "bg") {
      const response = await fetchImpl("/api/bg/stops");
      if (!response.ok)
        throw new Error(`Station download failed: ${response.status}`);
      catalog = await response.json();
      if (typeof catalog.updatedAt !== "string")
        throw new Error("Invalid stop catalog version");
      hash = catalog.updatedAt;
    } else {
      const hashResponse = await fetchImpl(
        `/api/stations/${encodeURIComponent(city)}/hash`,
      );
      if (!hashResponse.ok)
        throw new Error(`Station hash request failed: ${hashResponse.status}`);
      ({ hash } = await hashResponse.json());
    }
  } catch (error) {
    if (cached.length) return cached;
    throw error;
  }
  const database = await openDatabase();
  try {
    const read = database.transaction(["cityHashes"], "readonly");
    const readDone = transactionDone(read);
    const storedHash = await requestResult(
      read.objectStore("cityHashes").get(city),
    );
    await readDone;
    if (storedHash?.hash !== hash) {
      if (city !== "bg") {
        const response = await fetchImpl(
          `/api/stations/${encodeURIComponent(city)}/all`,
        );
        if (!response.ok)
          throw new Error(`Station download failed: ${response.status}`);
        catalog = await response.json();
      }
      const stations = normalizeStations(city, catalog);
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(
          ["stations", "cityHashes"],
          "readwrite",
        );
        const done = transactionDone(transaction);
        const store = transaction.objectStore("stations");
        for (const station of cached) store.delete([city, station.id]);
        for (const station of stations) store.put(station);
        transaction.objectStore("cityHashes").put({ city, hash });
        done.then(resolve, reject);
      });
    }
  } finally {
    database.close();
  }
  return getStations(city);
}
