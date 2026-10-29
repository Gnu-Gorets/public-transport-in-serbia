import { openDatabase } from "../stations/storage.js";

export type AlertTrigger = { kind: "minutes" | "stations"; value: number };
export type AlertDelivery = "push" | "local";
export type StoredAlert = {
  id: string;
  city: string;
  stationId: string;
  stationName: string;
  lineNumber: string;
  lineName: string;
  garageNo: string;
  trigger: AlertTrigger;
  delivery: AlertDelivery;
  createdAt: number;
  expiresAt: number;
  status: "active" | "triggered" | "expired" | "cancelled";
  missingSince: number | null;
};

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        transaction.error || new Error("Alert storage transaction failed"),
      );
  });
}

export async function listAlerts(): Promise<StoredAlert[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("alerts", "readonly");
    const done = completed(transaction);
    const request = transaction.objectStore("alerts").getAll();
    const alerts = await new Promise<StoredAlert[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await done;
    return alerts;
  } finally {
    database.close();
  }
}

export async function saveAlert(alert: StoredAlert): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("alerts", "readwrite");
    const done = completed(transaction);
    transaction.objectStore("alerts").put(alert);
    await done;
  } finally {
    database.close();
  }
}

export async function removeAlert(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("alerts", "readwrite");
    const done = completed(transaction);
    transaction.objectStore("alerts").delete(id);
    await done;
  } finally {
    database.close();
  }
}
