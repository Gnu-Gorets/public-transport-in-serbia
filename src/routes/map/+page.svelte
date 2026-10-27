<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import StationMap, {
    type Station as MapStation,
  } from "$lib/components/map/StationMap.svelte";
  import { loadPreferences } from "$lib/state/preferences";
  import { syncCity } from "$lib/stations/storage.js";
  import type { Station } from "$lib/stations";

  let city = $state("");
  let stations: Station[] = $state([]);
  let selected = $state<Station | null>(null);
  let error = $state("");
  let loading = $state(true);

  function selectStation(station: MapStation) {
    selected =
      stations.find((item) => String(item.uid) === String(station.uid)) || null;
    const url = new URL(page.url);
    if (selected) url.searchParams.set("station", String(selected.uid));
    else url.searchParams.delete("station");
    void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }

  onMount(async () => {
    try {
      const cities = (await fetch("/api/cities").then((response) =>
        response.json(),
      )) as Record<string, string>;
      const preferredCity = loadPreferences(localStorage).cityId;
      const requestedCity = page.url.searchParams.get("city");
      city =
        requestedCity && requestedCity in cities
          ? requestedCity
          : preferredCity && preferredCity in cities
            ? preferredCity
            : Object.keys(cities)[0] || "";
      stations = (await syncCity(city)).map((station) => ({
        name: station.name,
        uid: station.uid,
        id: station.id,
        coords: [station.lat, station.lon],
      }));
      const selectedId = page.url.searchParams.get("station");
      selected =
        stations.find((station) => String(station.uid) === selectedId) || null;
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "Unable to load stations.";
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Stations | Serbia++</title></svelte:head>
<div class="map-shell">
  <header class="appbar map-appbar">
    <button
      class="icon-button"
      aria-label="Back to search"
      onclick={() => goto("/")}>←</button
    >
    <div class="appbar-title"><strong>Stations</strong></div>
  </header>
  {#if loading}<div class="map-state" role="status">Loading stations…</div>
  {:else if error}<div class="map-state error" role="alert">
      {error}<button class="primary-button" onclick={() => location.reload()}
        >Retry</button
      >
    </div>
  {:else}<StationMap
      {stations}
      selectedStation={selected}
      onSelect={selectStation}
    />{/if}
  {#if selected}
    <section class="selection-card surface-card" aria-label="Selected station">
      <span class="station-pin" aria-hidden="true">⌖</span>
      <strong>{selected.name}</strong><span class="station-meta"
        >ID: {selected.id}</span
      >
      <button
        class="primary-button"
        onclick={() =>
          goto(
            `/stations/${encodeURIComponent(city)}/${encodeURIComponent(String(selected?.uid))}`,
          )}>Show arrivals →</button
      >
    </section>
  {/if}
</div>

<style>
  .map-shell {
    position: fixed;
    inset: 0;
    background: var(--m3c-background);
  }
  .map-appbar {
    position: absolute;
    inset: 0 0 auto;
    z-index: 500;
    background: color-mix(in srgb, var(--m3c-surface) 92%, transparent);
  }
  .map-shell :global(.station-map) {
    position: absolute;
    inset: 64px 0 0;
  }
  .map-state {
    position: absolute;
    z-index: 600;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 16px;
    border-radius: 16px;
    background: var(--m3c-surface-container);
  }
  .selection-card {
    position: absolute;
    z-index: 500;
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    left: 16px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    box-shadow: var(--m3-elevation-3);
  }
  @media (min-width: 840px) {
    .selection-card {
      right: 24px;
      left: auto;
      width: 360px;
    }
  }
</style>
