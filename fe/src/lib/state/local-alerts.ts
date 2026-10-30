import { listAlerts, removeAlert, saveAlert, type StoredAlert } from "./alerts";

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
    if (!alerts.length) return;
    const response = await fetch("/api/v2/alerts/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alerts }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      results?: Array<{ alert: StoredAlert; notification: string | null }>;
    };
    if (!response.ok || !Array.isArray(body.results))
      throw new Error(body.error || `Request failed (${response.status})`);
    for (const { alert, notification } of body.results) {
      await saveAlert(alert);
      if (notification) {
        notify(notification, alert.stationId, alert.city);
        await removeAlert(alert.id);
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
