import type { StoredAlert } from "./alerts";

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    result[index] = binary.charCodeAt(index);
  return result;
}

export async function requestPushPermission(): Promise<void> {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    throw new Error("Push alerts are unavailable in this browser.");
  if (
    Notification.permission === "default" &&
    (await Notification.requestPermission()) !== "granted"
  )
    throw new Error("Notification permission was not granted.");
  if (Notification.permission !== "granted")
    throw new Error("Enable notifications to use background alerts.");
}

async function subscriptionForPush(): Promise<PushSubscription> {
  if (!("Notification" in window) || Notification.permission !== "granted")
    throw new Error("Enable notifications to use background alerts.");
  const { publicKey } = await readResponse<{ publicKey: string }>(
    await fetch("/api/v2/alerts/vapid-key"),
  );
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return (
    existing ||
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(publicKey) as BufferSource,
    })
  );
}

export async function syncPushAlerts(alerts: StoredAlert[]): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!alerts.length) {
    if (subscription) {
      await readResponse<void>(
        await fetch("/api/v2/alerts", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }),
      );
      await subscription.unsubscribe();
    }
    return;
  }
  const activeSubscription = subscription || (await subscriptionForPush());
  await readResponse(
    await fetch("/api/v2/alerts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscription: activeSubscription.toJSON(),
        alerts,
      }),
    }),
  );
}
