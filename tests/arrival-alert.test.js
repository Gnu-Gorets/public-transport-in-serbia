import { describe, expect, it } from "vitest";
import {
  canCreateArrivalAlert,
  createArrivalAlert,
  evaluateArrivalAlert,
} from "../src/lib/alerts/arrival-alert.mjs";

const base = {
  id: "alert-1",
  subscriptionId: "subscription-1",
  city: "ns",
  stationId: "123",
  stationName: "Station",
  lineNumber: "7",
  lineName: "7A",
  garageNo: "456",
  trigger: { kind: "minutes", value: 5 },
  delivery: "local",
};
const present = (etaSeconds, etaStations = null) => ({
  type: "present",
  etaSeconds,
  etaStations,
});
const alert = (overrides = {}) =>
  createArrivalAlert({ ...base, ...overrides }, 1_000);

describe("arrival alert model", () => {
  it("accepts integer trigger values from 1 through 99", () => {
    expect(() => alert({ trigger: { kind: "minutes", value: 0 } })).toThrow(
      RangeError,
    );
    expect(() => alert({ trigger: { kind: "minutes", value: 1.5 } })).toThrow(
      RangeError,
    );
    expect(() =>
      alert({ trigger: { kind: "minutes", value: 99 } }),
    ).not.toThrow();
    expect(() => alert({ trigger: { kind: "minutes", value: 100 } })).toThrow(
      RangeError,
    );
  });

  it("fires once when minutes threshold is reached", () => {
    const result = evaluateArrivalAlert(alert(), present(300), 2_000);
    expect(result.status).toBe("fire");
    expect(result.alert.status).toBe("triggered");
    expect(evaluateArrivalAlert(result.alert, present(1), 3_000).status).toBe(
      "missing",
    );
  });

  it("evaluates station-count thresholds", () => {
    const stationAlert = alert({ trigger: { kind: "stations", value: 2 } });
    expect(
      evaluateArrivalAlert(stationAlert, present(null, 3), 2_000).status,
    ).toBe("waiting");
    expect(
      evaluateArrivalAlert(stationAlert, present(null, 2), 2_000).status,
    ).toBe("fire");
  });

  it("expires after two hours or ten continuous minutes missing", () => {
    const expired = evaluateArrivalAlert(alert(), present(600), 7_201_000);
    expect(expired.status).toBe("missing");
    expect(expired.alert.status).toBe("expired");
    const missing = evaluateArrivalAlert(alert(), { type: "missing" }, 2_000);
    expect(
      evaluateArrivalAlert(missing.alert, { type: "missing" }, 602_000).alert
        .status,
    ).toBe("expired");
  });

  it("does not count upstream errors as a missing vehicle", () => {
    const missing = evaluateArrivalAlert(alert(), { type: "missing" }, 2_000);
    const error = evaluateArrivalAlert(
      missing.alert,
      { type: "error" },
      500_000,
    );
    expect(error.status).toBe("waiting");
    expect(error.alert.missingSince).toBeNull();
  });

  it("enforces ten active alerts per subscription", () => {
    const alerts = Array.from({ length: 10 }, (_, index) =>
      alert({ id: `alert-${index}` }),
    );
    expect(canCreateArrivalAlert(alerts, "subscription-1")).toBe(false);
    expect(canCreateArrivalAlert(alerts, "another-subscription")).toBe(true);
    expect(canCreateArrivalAlert(alerts.slice(1), "subscription-1")).toBe(true);
  });
});
