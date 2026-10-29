import { getStationArrivals } from "../api";
import { evaluateArrivalAlert } from "#shared/arrival-alert.mjs";
import { listAlerts, removeAlert, saveAlert } from "./alerts";

let timer: ReturnType<typeof setInterval> | undefined;
let inFlight = false;

function notify(message: string, stationId: string, city: string): void {
  window.dispatchEvent(
    new CustomEvent("arrival-alert", { detail: { message } }),
  );
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    void navigator.serviceWorker?.ready
      .then((registration) =>
        registration.showNotification("Serbia++ arrival alert", {
          body: message,
          tag: `arrival-${city}-${stationId}`,
          data: {
            url: `/stations/${encodeURIComponent(city)}/${encodeURIComponent(stationId)}`,
          },
        }),
      )
      .catch(() => undefined);
  }
}

async function poll(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const alerts = (await listAlerts()).filter(
      (alert) => alert.status === "active" && alert.delivery === "local",
    );
    const groups = new Map<string, typeof alerts>();
    for (const alert of alerts) {
      const key = `${alert.city}:${alert.stationId}`;
      groups.set(key, [...(groups.get(key) || []), alert]);
    }
    for (const group of groups.values()) {
      const first = group[0];
      let response;
      try {
        response = await getStationArrivals(first.city, {
          uid: first.stationId,
        });
      } catch {
        for (const alert of group) {
          const result = evaluateArrivalAlert(alert, { type: "error" });
          await saveAlert(result.alert);
        }
        continue;
      }
      for (const alert of group) {
        const vehicle = response.vehicles.find(
          (item) =>
            String(item.lineNumber) === alert.lineNumber &&
            String(item.garageNo) === alert.garageNo,
        );
        const result = evaluateArrivalAlert(
          alert,
          vehicle
            ? {
                type: "present",
                etaSeconds: Number.isFinite(Number(vehicle.secondsLeft))
                  ? Number(vehicle.secondsLeft)
                  : null,
                etaStations: Number.isFinite(Number(vehicle.stationsBetween))
                  ? Number(vehicle.stationsBetween)
                  : null,
              }
            : { type: "missing" },
        );
        if (result.status === "fire") {
          await saveAlert(result.alert);
          const eta =
            alert.trigger.kind === "minutes"
              ? `${Math.max(0, Math.floor(Number(vehicle?.secondsLeft) / 60))} min`
              : `${vehicle?.stationsBetween} stops`;
          notify(
            `Line ${alert.lineName} reaches ${alert.stationName} in ${eta}.`,
            alert.stationId,
            alert.city,
          );
          await removeAlert(alert.id);
        } else if (result.alert.status === "expired") {
          await saveAlert(result.alert);
          notify(
            `Arrival alert for ${alert.stationName} expired.`,
            alert.stationId,
            alert.city,
          );
          await removeAlert(alert.id);
        } else {
          await saveAlert(result.alert);
        }
      }
    }
  } finally {
    inFlight = false;
  }
}

export function startLocalAlertMonitor(): () => void {
  if (timer) return () => undefined;
  void poll().catch(() => undefined);
  timer = setInterval(() => void poll().catch(() => undefined), 15_000);
  return () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
}
