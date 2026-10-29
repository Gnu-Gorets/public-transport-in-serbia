<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import AppIcon from "#lib/components/AppIcon.svelte";
  import {
    getBelgradeStopArrivals,
    getBelgradeStops,
    getBelgradeVehicles,
    getCatalogStopName,
    getStationArrivals,
  } from "#lib/api.ts";
  import type {
    BelgradeStopArrivals,
    BelgradeVehicle,
    StationArrivals,
    VehicleArrival,
  } from "#lib/api.ts";
  import { getFavorites, setFavorite } from "#lib/stations/storage.js";
  import StationMap from "#lib/components/map/StationMap.svelte";
  import type { Station } from "#lib/stations.ts";
  import { getLiveBelgradeArrivals } from "#lib/stations/belgrade-arrivals.ts";
  import {
    listAlerts,
    removeAlert,
    saveAlert,
    type StoredAlert,
  } from "#lib/state/alerts.ts";
  import { createArrivalAlert } from "#lib/alerts/arrival-alert.mjs";
  import {
    requestPushPermission,
    syncPushAlerts,
  } from "#lib/state/push-alerts.ts";

  let arrivals: StationArrivals | null = $state(null);
  let mapStations: Station[] = $state([]);
  let mapStation: Station | null = $state(null);
  let belgrade: BelgradeStopArrivals | null = $state(null);
  let belgradeVehicles: BelgradeVehicle[] = $state([]);
  let catalogName = $state("");
  let error = $state("");
  let loading = $state(true);
  let expandedLine = $state("");
  let favorite = $state(false);
  let alertDialog = $state<HTMLDialogElement>();
  let selectedVehicle: VehicleArrival | null = $state(null);
  let activeAlerts: StoredAlert[] = $state([]);
  let triggerKind = $state<"minutes" | "stations">("minutes");
  let triggerValue = $state(5);
  let delivery = $state<"local" | "push">("local");
  let alertError = $state("");
  let city = $derived(page.params.city);
  let uid = $derived(page.params.id);
  let liveBelgradeArrivals = $derived.by(() =>
    getLiveBelgradeArrivals(belgrade ? belgrade.arrivals : []),
  );
  let liveBelgradeVehicles = $derived(
    liveBelgradeArrivals.length ? belgradeVehicles : [],
  );
  let lines = $derived.by(() => {
    const grouped = new Map<string, VehicleArrival[]>();
    for (const vehicle of arrivals?.vehicles || []) {
      const line = String(vehicle.lineNumber);
      grouped.set(line, [...(grouped.get(line) || []), vehicle]);
    }
    return [...grouped.entries()]
      .map(([lineNumber, vehicles]) => ({
        lineNumber,
        name: vehicles[0]?.lineName || lineNumber,
        vehicles: vehicles.sort(
          (a, b) => Number(a.secondsLeft) - Number(b.secondsLeft),
        ),
      }))
      .sort((a, b) =>
        a.lineNumber.localeCompare(b.lineNumber, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
  });

  onMount(() => {
    void refreshAlerts();
    let active = true;
    let inFlight = false;
    let controller: AbortController | undefined;
    const load = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        if (city === "bg") {
          const [result, vehicleResult] = await Promise.all([
            getBelgradeStopArrivals(uid ?? "", controller.signal),
            getBelgradeVehicles(uid ?? "", controller.signal).catch(() => ({
              vehicles: [],
            })),
          ]);
          if (!active) return;
          belgrade = result;
          belgradeVehicles = vehicleResult.vehicles;
          arrivals = null;
          error = "";
          if (!mapStation) {
            const station: Station = {
              name: result.name,
              uid: result.uid,
              id: String(result.id),
              coords: result.coords,
              lines: [],
            };
            mapStation = station;
            mapStations = [station];
          }
          favorite = (await getFavorites()).some(
            (item) => item.city === city && item.id === String(result.id),
          );
        } else {
          belgradeVehicles = [];
          arrivals = await getStationArrivals(
            city ?? "",
            { uid: uid ?? "" },
            controller.signal,
          );
          if (!active) return;
          belgrade = null;
          error = "";
          if (!mapStation) {
            const station: Station = {
              name: arrivals.name || "Station",
              uid: arrivals.uid,
              id: String(arrivals.id),
              coords: arrivals.coords,
              lines: [],
            };
            mapStation = station;
            mapStations = [station];
          }
          favorite = (await getFavorites()).some(
            (item) => item.city === city && item.id === String(arrivals?.id),
          );
        }
      } catch (cause) {
        if (
          active &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        ) {
          error =
            cause instanceof Error ? cause.message : "Unable to load arrivals.";
        }
      } finally {
        inFlight = false;
        if (active) loading = false;
      }
    };
    if (city === "bg") {
      void getBelgradeStops()
        .then((catalog) => {
          if (active)
            catalogName = getCatalogStopName(
              catalog.stops,
              uid ?? "",
              belgrade?.name,
            );
        })
        .catch(() => {});
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
    };
  });

  async function refreshAlerts() {
    try {
      activeAlerts = (await listAlerts()).filter(
        (alert) =>
          alert.city === city &&
          alert.stationId === uid &&
          alert.status === "active",
      );
    } catch {
      activeAlerts = [];
    }
  }

  async function showAlerts() {
    selectedVehicle = null;
    await refreshAlerts();
    alertDialog?.showModal();
  }

  function createAlertFor(vehicle: VehicleArrival) {
    selectedVehicle = vehicle;
    triggerKind = "minutes";
    triggerValue = 5;
    delivery = "local";
    alertDialog?.showModal();
  }

  async function saveArrivalAlert() {
    alertError = "";
    if (!arrivals || !selectedVehicle || !selectedVehicle.garageNo) return;
    try {
      if (delivery === "push") await requestPushPermission();
      const alert = createArrivalAlert({
        id: crypto.randomUUID(),
        city: city || "",
        stationId: String(arrivals.uid),
        stationName: arrivals.name || "Station",
        lineNumber: String(selectedVehicle.lineNumber),
        lineName:
          selectedVehicle.lineName || String(selectedVehicle.lineNumber),
        garageNo: String(selectedVehicle.garageNo),
        trigger: { kind: triggerKind, value: triggerValue },
        delivery,
      });
      const existing = await listAlerts();
      const allActive = existing.filter((item) => item.status === "active");
      if (allActive.length >= 10) {
        alertError = "You can have up to 10 active alerts.";
        return;
      }
      await saveAlert(alert);
      if (delivery === "push") {
        try {
          await syncPushAlerts([
            ...existing.filter(
              (item) => item.delivery === "push" && item.status === "active",
            ),
            alert,
          ]);
        } catch (cause) {
          await removeAlert(alert.id);
          throw cause;
        }
      }
      await refreshAlerts();
      selectedVehicle = null;
      alertDialog?.close();
    } catch (cause) {
      alertError =
        cause instanceof Error ? cause.message : "Unable to save alert.";
    }
  }

  async function deleteArrivalAlert(alert: StoredAlert) {
    alertError = "";
    try {
      const remaining = (await listAlerts()).filter(
        (item) => item.id !== alert.id,
      );
      if (alert.delivery === "push") {
        await syncPushAlerts(
          remaining.filter(
            (item) => item.delivery === "push" && item.status === "active",
          ),
        );
      }
      await removeAlert(alert.id);
      await refreshAlerts();
    } catch (cause) {
      alertError =
        cause instanceof Error ? cause.message : "Unable to remove alert.";
    }
  }

  async function toggleFavorite() {
    const stationId = String(arrivals?.id || belgrade?.id || "");
    if (!stationId) return;
    try {
      await setFavorite(
        {
          city: city || "",
          id: stationId,
          uid: uid || "",
          name: arrivals?.name || belgrade?.name || stationId,
          lat: (arrivals?.coords || belgrade?.coords || [0, 0])[0],
          lon: (arrivals?.coords || belgrade?.coords || [0, 0])[1],
        },
        !favorite,
      );
      favorite = !favorite;
    } catch {
      error = "Favorites are unavailable in this browser.";
    }
  }

  function eta(seconds: string | number) {
    return `${Math.max(0, Math.floor(Number(seconds) / 60))} min`;
  }

  function arrivalTime(value: string | null) {
    if (!value) return "Scheduled";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }).format(date);
  }

  $effect(() => {
    const title = catalogName || arrivals?.name || belgrade?.name || "Arrivals";
    document.title = `${title} | Serbia++`;
  });
</script>

<svelte:head><title>Arrivals | Serbia++</title></svelte:head>
<div class="shell">
  <nav class="navigation-rail" aria-label="Main navigation">
    <a
      class="nav-link"
      href="/"
      aria-label="Nearby stations"
      title="Nearby stations"><AppIcon name="search" /></a
    >
    <a
      class="nav-link"
      href="/favorites"
      aria-label="Favorite stations"
      title="Favorite stations"><AppIcon name="favorite" /></a
    >
    <a class="nav-link" href="/map" aria-label="Station map" title="Station map"
      ><AppIcon name="map" /></a
    >
  </nav>
  <header class="appbar">
    <button
      class="icon-button"
      aria-label="Back to stations"
      title="Back to stations"
      onclick={() => history.back()}><AppIcon name="back" /></button
    >
    <div class="appbar-title">
      <strong
        >{catalogName || arrivals?.name || belgrade?.name || "Arrivals"}</strong
      ><small>{city}</small>
    </div>
    <button
      class="icon-button"
      aria-label={favorite ? "Remove favorite" : "Add favorite"}
      title={favorite ? "Remove favorite" : "Add favorite"}
      aria-pressed={favorite}
      onclick={toggleFavorite}
      ><AppIcon name="favorite" filled={favorite} /></button
    >
    {#if city !== "bg"}<button
        class="icon-button"
        aria-label={`Arrival alerts, ${activeAlerts.length} active`}
        title={`Arrival alerts, ${activeAlerts.length} active`}
        onclick={showAlerts}><AppIcon name="alerts" /></button
      >{/if}
  </header>
  <main id="main" class="content arrivals-content">
    {#if loading}<div class="empty" role="status">Loading arrivals…</div>{/if}
    {#if error}<div class="surface-card error" role="alert">
        {error}<button class="primary-button" onclick={() => location.reload()}
          >Retry</button
        >
      </div>{/if}
    {#if arrivals || belgrade}
      <div class="surface-card overview">
        <div class="station-meta">📍 {arrivals?.id || belgrade?.id}</div>
      </div>
      {#if belgrade}
        {#if liveBelgradeArrivals.length === 0}<div class="empty">
            No live arrival estimates are available for this stop.
          </div>{/if}
        {#each liveBelgradeArrivals as item (item.lineNumber + item.scheduledAt)}
          <div class="arrival-row">
            <strong class="line-badge">{item.lineNumber}</strong><span
              >{arrivalTime(item.estimatedAt || item.scheduledAt)}</span
            ><span>{item.destination || ""}</span>
          </div>
        {/each}
      {:else}
        {#if lines.length === 0}<div class="empty">
            No buses are arriving right now.
          </div>{/if}
        {#each lines as line (line.lineNumber)}
          <section class="line-card">
            <button
              class="line-heading"
              aria-expanded={expandedLine === line.lineNumber}
              onclick={() =>
                (expandedLine =
                  expandedLine === line.lineNumber ? "" : line.lineNumber)}
            >
              <span class="line-badge">{line.lineNumber}</span><strong
                >{line.name.split("-").at(-1)?.trim()}</strong
              >
              <span class="eta">{eta(line.vehicles[0].secondsLeft)}</span><span
                aria-hidden="true"
                >{expandedLine === line.lineNumber ? "⌃" : "⌄"}</span
              >
            </button>
            {#if expandedLine === line.lineNumber}
              {#each line.vehicles as vehicle (String(vehicle.garageNo) + String(vehicle.secondsLeft))}
                <div class="arrival-row">
                  <span class="eta">{eta(vehicle.secondsLeft)}</span><span
                    class="vehicle"
                    aria-label={`Vehicle number ${vehicle.garageNo || "unknown"}`}
                    >#{vehicle.garageNo || "—"}</span
                  ><span>{vehicle.stationsBetween} stops away</span
                  >{#if vehicle.stationName}<small
                      >Currently near {vehicle.stationName}</small
                    >{/if}<button
                    class="icon-button"
                    aria-label={`Create arrival alert for line ${line.lineNumber}`}
                    title={`Create arrival alert for line ${line.lineNumber}`}
                    disabled={!vehicle.garageNo}
                    onclick={() => createAlertFor(vehicle)}
                    ><AppIcon name="alerts" /></button
                  >
                </div>
              {/each}
            {/if}
          </section>
        {/each}
      {/if}
    {/if}
  </main>
  <section class="detail-pane" aria-label="Station map">
    {#if mapStations.length && mapStation}
      <StationMap
        stations={mapStations}
        selectedStation={mapStation}
        vehicles={arrivals?.vehicles || liveBelgradeVehicles}
      />
    {/if}
  </section>
</div>
{#if city !== "bg"}
  <dialog
    bind:this={alertDialog}
    class="alert-dialog"
    aria-labelledby="alertTitle"
    onclose={() => (selectedVehicle = null)}
  >
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void saveArrivalAlert();
      }}
    >
      <h2 id="alertTitle">
        {selectedVehicle ? "Create arrival alert" : "Arrival alerts"}
      </h2>
      {#if selectedVehicle}
        <p>
          Line {selectedVehicle.lineName || selectedVehicle.lineNumber} at {arrivals?.name}
        </p>
        <label for="triggerKind">Notify me when</label>
        <select id="triggerKind" bind:value={triggerKind}
          ><option value="minutes">Within minutes</option><option
            value="stations">Within stops</option
          ></select
        >
        <label for="triggerValue">Threshold (1–99)</label>
        <input
          id="triggerValue"
          type="number"
          min="1"
          max="99"
          step="1"
          bind:value={triggerValue}
          required
        />
        <label for="delivery">Delivery</label>
        <select id="delivery" bind:value={delivery}
          ><option value="local">While app is open</option><option value="push"
            >Background push</option
          ></select
        >
        {#if delivery === "push"}<p class="alert-help">
            Push requires notification permission and server VAPID
            configuration.
          </p>{/if}
      {:else if activeAlerts.length === 0}
        <p>No active arrival alerts at this station.</p>
      {:else}
        <ul>
          {#each activeAlerts as alert (alert.id)}<li>
              <span
                >Line {alert.lineName} · {alert.trigger.value}
                {alert.trigger.kind}</span
              ><button
                type="button"
                class="icon-button"
                aria-label={`Remove alert for line ${alert.lineName}`}
                title={`Remove alert for line ${alert.lineName}`}
                onclick={() => deleteArrivalAlert(alert)}>×</button
              >
            </li>{/each}
        </ul>
      {/if}
      {#if alertError}<p class="alert-error" role="alert">{alertError}</p>{/if}
      <div class="dialog-actions">
        <button
          type="button"
          class="icon-button"
          onclick={() => alertDialog?.close()}>Close</button
        >
        {#if selectedVehicle}<button class="primary-button">Save alert</button
          >{/if}
      </div>
    </form>
  </dialog>
{/if}
<a
  class="fab"
  href={`/map?city=${encodeURIComponent(city ?? "")}&station=${encodeURIComponent(uid ?? "")}`}
  aria-label="Show station on map"
  title="Show station on map"><AppIcon name="map" /></a
>

<style>
  .detail-pane {
    display: none;
  }
  .arrivals-content {
    padding-bottom: 96px;
  }
  @media (min-width: 840px) {
    .detail-pane {
      display: block;
      height: calc(100dvh - 56px);
    }
  }
  @media (min-width: 1200px) {
    .detail-pane {
      grid-column: 2 / -1;
    }
  }
  .line-card {
    margin: 12px 0;
    overflow: hidden;
    border-radius: 16px;
    background: var(--m3c-surface-container-low);
  }
  .line-heading {
    display: grid;
    width: 100%;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .line-badge {
    min-width: 42px;
    padding: 6px;
    border-radius: 8px;
    color: var(--m3c-on-primary-container);
    background: var(--m3c-primary-container);
    text-align: center;
  }
  .eta {
    font-size: 1.35rem;
    font-variant-numeric: tabular-nums;
  }
  .arrival-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--m3c-outline-variant);
  }
  .arrival-row small {
    color: var(--m3c-on-surface-variant);
    white-space: nowrap;
  }
  .vehicle {
    padding: 2px 8px;
    border: 1px solid var(--m3c-outline);
    border-radius: 8px;
    font-variant-numeric: tabular-nums;
  }
  .alert-dialog {
    width: min(440px, calc(100vw - 32px));
    border: 0;
    border-radius: 28px;
    color: var(--m3c-on-surface);
    background: var(--m3c-surface-container-high);
  }
  .alert-dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  .alert-dialog label {
    display: block;
    margin: 16px 0 6px;
  }
  .alert-dialog select,
  .alert-dialog input[type="number"] {
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid var(--m3c-outline);
    border-radius: 8px;
    color: inherit;
    background: var(--m3c-surface);
  }
  .alert-dialog ul {
    display: grid;
    gap: 8px;
    padding: 0;
    list-style: none;
  }
  .alert-dialog li {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .alert-help,
  .alert-error {
    color: var(--m3c-on-surface-variant);
  }
  .alert-error {
    color: var(--m3c-error);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
</style>
