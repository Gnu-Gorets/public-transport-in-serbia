const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const webpush = require("web-push");
const { getStationInfo, getAvailableCities } = require("./providerService");
const { state } = require("../state");

const MAX_ALERTS_PER_SUBSCRIPTION = 10;
const MAX_MONITORED_STATIONS = 300;
const POLL_INTERVAL_MS = 15_000;
const MAX_LOCAL_ALERTS = 10;
const ALERT_TTL_MS = 2 * 60 * 60 * 1000;
const records = new Map();
let timer;
let monitoring = false;
let writeQueue = Promise.resolve();
let evaluateAlert;

const configured = () =>
  Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );

const dataFile = () =>
  path.join(
    process.env.ALERTS_DATA_DIR || path.join(process.cwd(), "data"),
    "alerts.json",
  );

const endpointId = (endpoint) =>
  crypto.createHash("sha256").update(endpoint).digest("hex");

function validateSubscription(value) {
  if (
    !value ||
    typeof value.endpoint !== "string" ||
    value.endpoint.length > 2048 ||
    !value.endpoint.startsWith("https://") ||
    !value.keys ||
    typeof value.keys.p256dh !== "string" ||
    value.keys.p256dh.length > 256 ||
    typeof value.keys.auth !== "string" ||
    value.keys.auth.length > 128
  )
    throw Object.assign(new Error("Invalid push subscription"), {
      statusCode: 400,
    });
}

function validateAlert(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id ||
    value.id.length > 80 ||
    typeof value.city !== "string" ||
    !value.city ||
    value.city === "bg" ||
    !Object.hasOwn(getAvailableCities(), value.city) ||
    value.city.length > 32 ||
    typeof value.stationId !== "string" ||
    !value.stationId ||
    value.stationId.length > 32 ||
    typeof value.stationName !== "string" ||
    !value.stationName ||
    value.stationName.length > 120 ||
    typeof value.lineNumber !== "string" ||
    !value.lineNumber ||
    value.lineNumber.length > 32 ||
    typeof value.lineName !== "string" ||
    !value.lineName ||
    value.lineName.length > 120 ||
    typeof value.garageNo !== "string" ||
    !value.garageNo ||
    value.garageNo.length > 32 ||
    !value.trigger ||
    !["minutes", "stations"].includes(value.trigger.kind) ||
    !Number.isInteger(value.trigger.value) ||
    value.trigger.value < 1 ||
    value.trigger.value > 99
  )
    throw Object.assign(new Error("Invalid alert"), { statusCode: 400 });
  const createdAt = Date.now();
  return {
    id: value.id,
    city: value.city,
    stationId: value.stationId,
    stationName: value.stationName,
    lineNumber: value.lineNumber,
    lineName: value.lineName,
    garageNo: value.garageNo,
    trigger: { kind: value.trigger.kind, value: value.trigger.value },
    delivery: "push",
    createdAt,
    expiresAt: createdAt + ALERT_TTL_MS,
    missingSince: null,
    status: "active",
  };
}

async function persist() {
  const file = dataFile();
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify([...records.entries()]), {
        mode: 0o600,
      });
      await fs.rename(temporary, file);
    });
  return writeQueue;
}

async function load() {
  try {
    const content = await fs.readFile(dataFile(), "utf8");
    for (const [id, record] of JSON.parse(content)) {
      const alerts = Array.isArray(record?.alerts)
        ? record.alerts.filter((alert) => alert.status === "active")
        : [];
      if (
        typeof id === "string" &&
        record?.subscription?.endpoint &&
        alerts.length
      )
        records.set(id, { subscription: record.subscription, alerts });
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  startMonitor();
}

function startMonitor() {
  if (
    timer ||
    ![...records.values()].some(({ alerts }) =>
      alerts.some((alert) => alert.status === "active"),
    )
  )
    return;
  timer = setInterval(() => void monitor(), POLL_INTERVAL_MS);
  timer.unref?.();
  void monitor();
}

async function send(record, alert, title, body, url) {
  try {
    await webpush.sendNotification(
      record.subscription,
      JSON.stringify({ specId: alert.id, title, body, url }),
      { TTL: 60, urgency: "high" },
    );
    return true;
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      records.delete(endpointId(record.subscription.endpoint));
      return true;
    }
    return false;
  }
}

async function monitor() {
  if (monitoring || !records.size) return;
  monitoring = true;
  try {
    const { evaluateArrivalAlert } =
      evaluateAlert || (evaluateAlert = await import("./arrivalAlert.mjs"));
    const grouped = new Map();
    const now = Date.now();
    for (const [subscriptionId, record] of records) {
      for (const alert of record.alerts) {
        if (alert.status !== "active") continue;
        const key = `${alert.city}:${alert.stationId}`;
        const group = grouped.get(key) || {
          city: alert.city,
          stationId: alert.stationId,
          items: [],
        };
        group.items.push({ subscriptionId, record, alert });
        grouped.set(key, group);
      }
    }

    for (const group of grouped.values()) {
      let response;
      try {
        response = await getStationInfo(group.city, { uid: group.stationId });
      } catch {
        for (const { alert } of group.items) {
          const result = evaluateArrivalAlert(alert, { type: "error" }, now);
          alert.missingSince = result.alert.missingSince;
        }
        continue;
      }
      for (const item of group.items) {
        const { alert, record, subscriptionId } = item;
        const vehicle = (response.vehicles || []).find(
          (arrival) =>
            String(arrival.lineNumber) === alert.lineNumber &&
            String(arrival.garageNo) === alert.garageNo,
        );
        const observation = vehicle
          ? {
              type: "present",
              etaSeconds: Number(vehicle.secondsLeft),
              etaStations: Number(vehicle.stationsBetween),
            }
          : { type: "missing" };
        const result = evaluateArrivalAlert(alert, observation, now);
        Object.assign(alert, result.alert);
        if (result.status === "fire") {
          const minutes = alert.trigger.kind === "minutes";
          const value = minutes
            ? `${Math.max(0, Math.floor(Number(vehicle.secondsLeft) / 60))} minutes`
            : `${vehicle.stationsBetween} stations`;
          const sent = await send(
            record,
            alert,
            `Line ${alert.lineName} is approaching`,
            `Line ${alert.lineName} reaches ${alert.stationName} in ${value}.`,
            `/stations/${encodeURIComponent(alert.city)}/${encodeURIComponent(alert.stationId)}`,
          );
          if (!sent) alert.status = "active";
        } else if (result.status === "missing" || now >= alert.expiresAt) {
          await send(
            record,
            alert,
            `Stopped tracking line ${alert.lineName}`,
            `Arrival alert for ${alert.stationName} has expired.`,
            `/stations/${encodeURIComponent(alert.city)}/${encodeURIComponent(alert.stationId)}`,
          );
          alert.status = "expired";
        }
        record.alerts = record.alerts.filter(
          (item) => item.status === "active",
        );
        if (!record.alerts.length) records.delete(subscriptionId);
      }
    }
    await persist();
  } finally {
    monitoring = false;
    if (![...records.values()].some(({ alerts }) => alerts.length)) {
      clearInterval(timer);
      timer = undefined;
    }
  }
}

async function replaceAlerts(subscription, inputAlerts) {
  validateSubscription(subscription);
  if (
    !Array.isArray(inputAlerts) ||
    inputAlerts.length > MAX_ALERTS_PER_SUBSCRIPTION
  )
    throw Object.assign(new Error("Invalid alert list"), { statusCode: 400 });
  const id = endpointId(subscription.endpoint);
  const alerts = inputAlerts.map(validateAlert);
  if (new Set(alerts.map(({ id: alertId }) => alertId)).size !== alerts.length)
    throw Object.assign(new Error("Duplicate alert IDs"), { statusCode: 400 });
  const stationData = state.allStations;
  for (const alert of alerts) {
    const station = Object.values(stationData[alert.city] || {}).find(
      (item) =>
        String(item.uid) === alert.stationId ||
        String(item.id) === alert.stationId,
    );
    if (!station)
      throw Object.assign(new Error("Unknown station"), { statusCode: 400 });
    alert.stationId = String(station.uid);
  }
  const monitoredStations = new Set(
    [...records.entries()].flatMap(([subscriptionId, record]) =>
      subscriptionId === id
        ? []
        : record.alerts
            .filter((alert) => alert.status === "active")
            .map((alert) => `${alert.city}:${alert.stationId}`),
    ),
  );
  for (const alert of alerts)
    monitoredStations.add(`${alert.city}:${alert.stationId}`);
  if (monitoredStations.size > MAX_MONITORED_STATIONS)
    throw Object.assign(new Error("Too many monitored stations"), {
      statusCode: 429,
    });
  if (alerts.length) records.set(id, { subscription, alerts });
  else records.delete(id);
  startMonitor();
  return persist().then(() =>
    alerts.map(({ id: alertId, status }) => ({ id: alertId, status })),
  );
}

async function removeSubscription(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 2048)
    throw Object.assign(new Error("Invalid push endpoint"), {
      statusCode: 400,
    });
  records.delete(endpointId(endpoint));
  await persist();
  if (![...records.values()].some(({ alerts }) => alerts.length)) {
    clearInterval(timer);
    timer = undefined;
  }
}

function configureVapid() {
  if (configured())
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
}

async function evaluateLocalAlerts(inputAlerts) {
  if (!Array.isArray(inputAlerts) || inputAlerts.length > MAX_LOCAL_ALERTS)
    throw Object.assign(new Error("Invalid alert list"), { statusCode: 400 });

  const alerts = inputAlerts.map((alert) => {
    if (
      !alert ||
      typeof alert.id !== "string" ||
      !alert.id ||
      alert.id.length > 80 ||
      typeof alert.city !== "string" ||
      !Object.hasOwn(getAvailableCities(), alert.city) ||
      typeof alert.stationId !== "string" ||
      !alert.stationId ||
      alert.stationId.length > 32 ||
      typeof alert.stationName !== "string" ||
      !alert.stationName ||
      alert.stationName.length > 120 ||
      typeof alert.lineNumber !== "string" ||
      !alert.lineNumber ||
      alert.lineNumber.length > 32 ||
      typeof alert.lineName !== "string" ||
      !alert.lineName ||
      alert.lineName.length > 120 ||
      typeof alert.garageNo !== "string" ||
      !alert.garageNo ||
      alert.garageNo.length > 32 ||
      alert.status !== "active" ||
      alert.delivery !== "local" ||
      !alert.trigger ||
      !["minutes", "stations"].includes(alert.trigger.kind) ||
      !Number.isInteger(alert.trigger.value) ||
      alert.trigger.value < 1 ||
      alert.trigger.value > 99 ||
      !Number.isFinite(alert.expiresAt) ||
      (alert.missingSince !== null && !Number.isFinite(alert.missingSince))
    )
      throw Object.assign(new Error("Invalid alert"), { statusCode: 400 });
    return alert;
  });

  const { evaluateArrivalAlert } = await import("./arrivalAlert.mjs");
  const groups = new Map();
  for (const alert of alerts) {
    const key = `${alert.city}:${alert.stationId}`;
    const group = groups.get(key) || [];
    group.push(alert);
    groups.set(key, group);
  }

  const results = [];
  const now = Date.now();
  for (const group of groups.values()) {
    const first = group[0];
    let vehicles;
    try {
      ({ vehicles } = await getStationInfo(first.city, {
        uid: first.stationId,
      }));
    } catch {
      results.push(
        ...group.map((alert) => ({
          alert: evaluateArrivalAlert(alert, { type: "error" }, now).alert,
          notification: null,
        })),
      );
      continue;
    }
    for (const alert of group) {
      const vehicle = (vehicles || []).find(
        (item) =>
          String(item.lineNumber) === alert.lineNumber &&
          String(item.garageNo) === alert.garageNo,
      );
      const observation = vehicle
        ? {
            type: "present",
            etaSeconds: Number.isFinite(Number(vehicle.secondsLeft))
              ? Number(vehicle.secondsLeft)
              : null,
            etaStations: Number.isFinite(Number(vehicle.stationsBetween))
              ? Number(vehicle.stationsBetween)
              : null,
          }
        : { type: "missing" };
      const result = evaluateArrivalAlert(alert, observation, now);
      let notification = null;
      if (result.status === "fire") {
        const eta =
          alert.trigger.kind === "minutes"
            ? `${Math.max(0, Math.floor(Number(vehicle.secondsLeft) / 60))} min`
            : `${vehicle.stationsBetween} stops`;
        notification = `Line ${alert.lineName} reaches ${alert.stationName} in ${eta}.`;
      } else if (result.alert.status === "expired") {
        notification = `Arrival alert for ${alert.stationName} expired.`;
      }
      results.push({ alert: result.alert, notification });
    }
  }
  return results;
}

module.exports = {
  configured,
  evaluateLocalAlerts,
  configureVapid,
  load,
  replaceAlerts,
  removeSubscription,
  _test: { records, monitor, validateAlert, validateSubscription },
};
