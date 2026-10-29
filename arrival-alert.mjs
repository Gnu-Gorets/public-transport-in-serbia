const ALERT_TTL_MS = 2 * 60 * 60 * 1000;
const MISSING_TTL_MS = 10 * 60 * 1000;
export const MAX_ACTIVE_ALERTS_PER_SUBSCRIPTION = 10;

/** @typedef {"minutes" | "stations"} AlertTriggerKind */
/** @typedef {{kind: AlertTriggerKind, value: number}} AlertTrigger */
/** @typedef {{id: string, subscriptionId?: string, city: string, stationId: string, stationName: string, lineNumber: string, lineName: string, garageNo: string, trigger: AlertTrigger, delivery: "push" | "local", createdAt: number, expiresAt: number, missingSince: number | null, status: "active" | "triggered" | "expired" | "cancelled"}} ArrivalAlert */
/** @typedef {{type: "present", etaSeconds: number | null, etaStations: number | null} | {type: "missing"} | {type: "error"}} ArrivalObservation */

/** @param {Omit<ArrivalAlert, "createdAt" | "expiresAt" | "missingSince" | "status">} input @param {number} [now] @returns {ArrivalAlert} */
export function createArrivalAlert(input, now = Date.now()) {
  if (
    !Number.isInteger(input.trigger.value) ||
    input.trigger.value < 1 ||
    input.trigger.value > 99
  ) {
    throw new RangeError("Arrival alert value must be an integer from 1 to 99");
  }
  if (input.trigger.kind !== "minutes" && input.trigger.kind !== "stations") {
    throw new TypeError('Arrival alert kind must be "minutes" or "stations"');
  }
  return {
    ...input,
    createdAt: now,
    expiresAt: now + ALERT_TTL_MS,
    missingSince: null,
    status: "active",
  };
}

/** @param {ArrivalAlert[]} alerts @param {string} subscriptionId @returns {boolean} */
export function canCreateArrivalAlert(alerts, subscriptionId) {
  return (
    alerts.filter(
      (alert) =>
        alert.subscriptionId === subscriptionId && alert.status === "active",
    ).length < MAX_ACTIVE_ALERTS_PER_SUBSCRIPTION
  );
}

/** @param {ArrivalAlert} alert @param {ArrivalObservation} observation @param {number} [now] @returns {{status: "fire" | "waiting" | "missing", alert: ArrivalAlert}} */
export function evaluateArrivalAlert(alert, observation, now = Date.now()) {
  if (alert.status !== "active") return { status: "missing", alert };
  if (now >= alert.expiresAt)
    return { status: "missing", alert: { ...alert, status: "expired" } };

  if (observation.type === "error")
    return { status: "waiting", alert: { ...alert, missingSince: null } };
  if (observation.type === "missing") {
    const missingSince = alert.missingSince ?? now;
    if (now - missingSince >= MISSING_TTL_MS)
      return {
        status: "missing",
        alert: { ...alert, missingSince, status: "expired" },
      };
    return { status: "waiting", alert: { ...alert, missingSince } };
  }

  const reached =
    alert.trigger.kind === "minutes"
      ? observation.etaSeconds !== null &&
        observation.etaSeconds <= alert.trigger.value * 60
      : observation.etaStations !== null &&
        observation.etaStations <= alert.trigger.value;
  return {
    status: reached ? "fire" : "waiting",
    alert: {
      ...alert,
      missingSince: null,
      status: reached ? "triggered" : "active",
    },
  };
}
