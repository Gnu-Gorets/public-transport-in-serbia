export type AlertTriggerKind = "minutes" | "stations";
export type AlertTrigger = { kind: AlertTriggerKind; value: number };
export type ArrivalAlert = {
  id: string;
  subscriptionId?: string;
  city: string;
  stationId: string;
  stationName: string;
  lineNumber: string;
  lineName: string;
  garageNo: string;
  trigger: AlertTrigger;
  delivery: "push" | "local";
  createdAt: number;
  expiresAt: number;
  missingSince: number | null;
  status: "active" | "triggered" | "expired" | "cancelled";
};
export type ArrivalObservation =
  | { type: "present"; etaSeconds: number | null; etaStations: number | null }
  | { type: "missing" }
  | { type: "error" };
export const MAX_ACTIVE_ALERTS_PER_SUBSCRIPTION: 10;
export function createArrivalAlert(
  input: Omit<
    ArrivalAlert,
    "createdAt" | "expiresAt" | "missingSince" | "status"
  >,
  now?: number,
): ArrivalAlert;
export function canCreateArrivalAlert(
  alerts: ArrivalAlert[],
  subscriptionId: string,
): boolean;
export function evaluateArrivalAlert(
  alert: ArrivalAlert,
  observation: ArrivalObservation,
  now?: number,
): { status: "fire" | "waiting" | "missing"; alert: ArrivalAlert };
