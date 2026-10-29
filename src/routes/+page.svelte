<script lang="ts">
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/env";
  import AppIcon from "#lib/components/AppIcon.svelte";
  import type { Station } from "#lib/stations.ts";
  import {
    searchStations,
    visibleStations as getVisibleStations,
  } from "#lib/stations.ts";
  import {
    getFavorites,
    setFavorite,
    syncCity,
  } from "#lib/stations/storage.js";
  import {
    DEFAULT_PREFERENCES,
    loadPreferences,
    savePreferences,
  } from "#lib/state/preferences.ts";
  import type { Accent } from "#lib/state/preferences.ts";
  import {
    Hct,
    SchemeTonalSpot,
  } from "@ktibow/material-color-utilities-nightly";
  import { colors, genCSS } from "m3-svelte/etc/colors";

  let cities: Record<string, string> = $state({});
  let city = $state("");
  let stations: Station[] = $state([]);
  let query = $state("");
  let inputQuery = $state("");
  let loading = $state(false);
  let error = $state("");
  let rangeMeters = $state(400);
  let origin: [number, number] | null = $state(null);
  let locationEnabled = $state(false);
  let locationMode = $state(false);
  let favorites: string[] = $state([]);
  let settingsOpen = $state(false);
  let settingsDialog = $state<HTMLDialogElement>();
  let settingsSnapshot: {
    city: string;
    rangeMeters: number;
    theme: string;
    accent: Accent;
    hue: number;
  } | null = null;
  let theme = $state("system");
  let accent: Accent = $state("bgpp-teal");
  let hue = $state(176.5);
  let filtered = $derived(searchStations(stations, query));
  const cityCenters: Record<string, [number, number]> = {
    bg: [44.81254796404323, 20.46145496621977],
    ns: [45.267136, 19.833549],
    nis: [43.3209, 21.8958],
  };
  let visibleStations = $derived(
    query
      ? filtered.map((station) => ({ ...station, distance: null }))
      : getVisibleStations(
          stations,
          locationEnabled,
          origin || cityCenters[city] || cityCenters.ns,
          rangeMeters,
        ),
  );

  $effect(() => {
    const value = inputQuery;
    const timeout = setTimeout(() => (query = value), 150);
    return () => clearTimeout(timeout);
  });

  onMount(async () => {
    try {
      cities = await getJson<Record<string, string>>("/api/cities");
      const saved = loadPreferences(localStorage);
      city =
        saved.cityId && saved.cityId in cities
          ? saved.cityId
          : Object.keys(cities)[0] || "";
      rangeMeters = saved.rangeMeters || DEFAULT_PREFERENCES.rangeMeters;
      theme = saved.theme;
      accent = saved.accent;
      if (typeof accent === "object") hue = accent.hue;
      if (theme !== "system") document.documentElement.dataset.theme = theme;
      applyAccent(accent);
      await loadFavorites();
      await loadStations();
    } catch (cause) {
      error = message(cause);
    }
  });

  async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as T;
  }

  function message(cause: unknown): string {
    return cause instanceof Error ? cause.message : "Something went wrong.";
  }

  async function loadStations() {
    if (!city) return;
    loading = true;
    error = "";
    try {
      try {
        const cached = await syncCity(city);
        stations = cached.map((station) => ({
          name: station.name,
          uid: station.uid,
          id: station.id,
          coords: [station.lat, station.lon],
          lines: [],
        }));
      } catch {
        if (city === "bg") {
          const response = await getJson<{
            stops: Array<{
              id: string;
              name: string;
              coords: [number, number];
            }>;
          }>("/api/bg/stops");
          stations = response.stops.map((stop) => ({
            ...stop,
            uid: stop.id,
            lines: [],
          }));
        } else {
          stations = await getJson<Station[]>(
            `/api/stations/${encodeURIComponent(city)}/all`,
          );
        }
      }
    } catch (cause) {
      error = message(cause);
    } finally {
      loading = false;
    }
  }

  async function loadFavorites() {
    try {
      favorites = (await getFavorites())
        .filter((item) => item.city === city)
        .map((item) => item.id);
    } catch {
      favorites = [];
    }
  }

  function toggleTheme(value: string) {
    theme = value;
    if (value === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme =
      value === "system" ? "light dark" : value;
  }

  function applyAccent(value: Accent) {
    accent = value;
    const seedHue =
      typeof value === "object"
        ? value.hue
        : value === "device-blue"
          ? 200
          : 176.5;
    const source = Hct.from(seedHue, 36, 50);
    const stylesheet = genCSS(
      new SchemeTonalSpot(source, false, 0),
      new SchemeTonalSpot(source, true, 0),
      colors,
    );
    let style = document.getElementById(
      "dynamic-accent",
    ) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "dynamic-accent";
      document.head.append(style);
    }
    style.textContent = stylesheet;
    document.documentElement.style.colorScheme =
      theme === "system" ? "light dark" : theme;
  }

  async function toggleFavorite(station: Station) {
    const key = station.id;
    const isFavorite = favorites.includes(key);
    await setFavorite(
      {
        city,
        id: station.id,
        uid: station.uid,
        name: station.name,
        lat: station.coords[0],
        lon: station.coords[1],
      },
      !isFavorite,
    );
    favorites = isFavorite
      ? favorites.filter((id) => id !== key)
      : [...favorites, key];
  }

  async function useLocation() {
    if (locationMode) {
      locationMode = false;
      locationEnabled = false;
      origin = null;
      error = "";
      return;
    }
    locationMode = true;
    error = "";
    if (!navigator.geolocation) {
      error = "Location is unavailable in this browser.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        origin = [coords.latitude, coords.longitude];
        locationEnabled = true;
      },
      () => (error = "Unable to determine your location."),
      { timeout: 10000 },
    );
  }

  function openStation(station: Station) {
    goto(
      `/stations/${encodeURIComponent(city)}/${encodeURIComponent(String(station.uid))}`,
    );
  }

  async function openSettings() {
    settingsSnapshot = { city, rangeMeters, theme, accent, hue };
    settingsOpen = true;
    await tick();
    settingsDialog?.showModal();
  }

  function cancelSettings() {
    if (settingsSnapshot) {
      city = settingsSnapshot.city;
      rangeMeters = settingsSnapshot.rangeMeters;
      theme = settingsSnapshot.theme;
      accent = settingsSnapshot.accent;
      hue = settingsSnapshot.hue;
      if (theme === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = theme;
      applyAccent(accent);
    }
    settingsSnapshot = null;
    settingsOpen = false;
  }

  async function saveSettings() {
    const cityChanged = settingsSnapshot?.city !== city;
    settingsSnapshot = null;
    if (cityChanged) {
      origin = null;
      locationMode = false;
      locationEnabled = false;
      query = "";
      inputQuery = "";
    }
    settingsDialog?.close();
    savePreferences(localStorage, {
      ...loadPreferences(localStorage),
      cityId: city,
      rangeMeters,
      theme: theme as "system" | "light" | "dark",
      accent,
    });
    settingsOpen = false;
    await loadFavorites();
    await loadStations();
  }

  if (!browser) loading = true;
</script>

<svelte:head>
  <title>{cities[city] || "Serbia++"} | Stations</title>
  <meta
    name="description"
    content="Search public transport stations in Serbia."
  />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>
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
    <div class="appbar-title">
      <strong>Search stations</strong><small>{cities[city] || ""}</small>
    </div>
    <button
      class="icon-button"
      aria-label="Favorite stations"
      title="Favorite stations"
      onclick={() => goto("/favorites")}><AppIcon name="favorite" /></button
    >
    <button
      class="icon-button refresh-button"
      aria-label="Refresh stations"
      title="Refresh stations"
      onclick={loadStations}><AppIcon name="refresh" /></button
    >
    <button
      class="icon-button"
      aria-label="Preferences"
      title="Preferences"
      onclick={openSettings}><AppIcon name="more" /></button
    >
  </header>
  <main id="main" class="content">
    <div class="search-row">
      <input
        class="search-input"
        bind:value={inputQuery}
        placeholder="Search stations"
        aria-label="Search stations"
      />
      {#if inputQuery}<button
          class="icon-button"
          aria-label="Clear search"
          title="Clear search"
          onclick={() => (inputQuery = "")}><AppIcon name="clear" /></button
        >{/if}
      <button
        class="icon-button"
        aria-label={locationMode ? "Cancel nearby stations" : "Use my location"}
        title={locationMode ? "Cancel nearby stations" : "Use my location"}
        aria-pressed={locationMode}
        onclick={useLocation}><AppIcon name="pin" /></button
      >
    </div>
    {#if locationEnabled}
      <p class="station-meta">Using your location · {rangeMeters} m</p>
    {/if}
    {#if loading}
      <div class="empty" role="status">Loading stations…</div>
    {:else if error}
      <div class="empty error" role="alert">
        {error}<br /><button class="primary-button" onclick={loadStations}
          >Retry</button
        >
      </div>
    {:else if query && filtered.length === 0}
      <div class="empty">No stations match your criteria.</div>
    {:else if !query && locationEnabled && visibleStations.length === 0}
      <div class="empty">No stations within range.</div>
    {:else}
      <div class="station-list" aria-label="Stations">
        {#each visibleStations as station (station.uid)}
          <div class="station-row">
            <span class="station-pin"><AppIcon name="location" /></span>
            <button class="station-open" onclick={() => openStation(station)}>
              <strong>{station.name}</strong>
              {#if station.distance !== null}<div class="station-meta">
                  ↔ {Math.round(station.distance)} m
                </div>{/if}
            </button>
            <button
              class="icon-button"
              aria-label={`${favorites.includes(station.id) ? "Remove from" : "Add to"} favorites: ${station.name}`}
              title={`${favorites.includes(station.id) ? "Remove from" : "Add to"} favorites: ${station.name}`}
              aria-pressed={favorites.includes(station.id)}
              onclick={() => toggleFavorite(station)}
            >
              <AppIcon
                name="favorite"
                filled={favorites.includes(station.id)}
              />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </main>
  <section class="detail-pane" aria-label="Station details"></section>
</div>
{#if settingsOpen}
  <dialog
    bind:this={settingsDialog}
    class="settings-dialog"
    aria-labelledby="settingsTitle"
    onclose={cancelSettings}
  >
    <form
      onsubmit={(event) => {
        event.preventDefault();
        saveSettings();
      }}
    >
      <h2 id="settingsTitle">Preferences</h2>
      <label for="settingsCity">City</label>
      <select id="settingsCity" bind:value={city}>
        {#each Object.entries(cities) as [id, name] (id)}<option value={id}
            >{name}</option
          >{/each}
      </select>
      <label for="range">Range: {rangeMeters} m</label>
      <input
        id="range"
        type="range"
        min="100"
        max="1000"
        step="50"
        bind:value={rangeMeters}
      />
      <label for="theme">Theme</label>
      <select
        id="theme"
        value={theme}
        onchange={(event) => toggleTheme(event.currentTarget.value)}
      >
        <option value="system">System</option><option value="light"
          >Light</option
        ><option value="dark">Dark</option>
      </select>
      <label for="accent">Accent</label>
      <select
        id="accent"
        value={typeof accent === "object" ? "custom" : accent}
        onchange={(event) =>
          applyAccent(
            event.currentTarget.value === "custom"
              ? { hue }
              : (event.currentTarget.value as Accent),
          )}
      >
        <option value="bgpp-teal">BG++ teal</option><option value="device-blue"
          >Device blue</option
        ><option value="custom">Custom hue</option>
      </select>
      {#if typeof accent === "object"}
        <label for="accentHue">Hue: {Math.round(hue)}°</label>
        <input
          id="accentHue"
          type="range"
          min="0"
          max="360"
          step="1"
          bind:value={hue}
          oninput={() => applyAccent({ hue })}
        />
      {/if}
      <nav class="settings-links" aria-label="Information">
        <a href="/api/v2">API reference</a>
        <a
          href="https://github.com/GnuGorets/public-transport-in-serbia"
          target="_blank"
          rel="noreferrer">Source code</a
        >
      </nav>
      <div class="dialog-actions">
        <button
          type="button"
          class="icon-button"
          onclick={() => settingsDialog?.close()}>Cancel</button
        ><button class="primary-button">Apply</button>
      </div>
    </form>
  </dialog>
{/if}

<style>
  .station-open {
    width: 100%;
    padding: 8px 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .station-row:hover {
    background: color-mix(in srgb, var(--m3c-on-surface) 6%, transparent);
  }
  .settings-dialog {
    width: min(420px, calc(100vw - 32px));
    border: 0;
    border-radius: 28px;
    color: var(--m3c-on-surface);
    background: var(--m3c-surface-container-high);
  }
  .settings-dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  .settings-dialog label {
    display: block;
    margin: 16px 0 6px;
  }
  .settings-dialog select {
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid var(--m3c-outline);
    border-radius: 8px;
    color: inherit;
    background: var(--m3c-surface);
  }
  .settings-links {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 20px;
  }
  .settings-links a {
    color: var(--m3c-primary);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
</style>
