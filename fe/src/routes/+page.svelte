<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import AppIcon from "#lib/components/AppIcon.svelte";
  import {
    getBelgradeStops,
    getCities,
    getStations as getStationsFromApi,
  } from "#lib/api.ts";
  import type { Station } from "#lib/stations.ts";
  import {
    INITIAL_STATION_COUNT,
    searchStations,
    sortStations,
    visibleStations as getVisibleStations,
  } from "#lib/stations.ts";
  import {
    getFavorites,
    getStations,
    setFavorite,
    syncCity,
  } from "#lib/stations/storage.js";
  import {
    DEFAULT_PREFERENCES,
    loadPreferences,
    savePreferences,
  } from "#lib/state/preferences.ts";
  import { applyAccentStyles, applyTheme } from "#lib/state/theme.ts";

  let { data } = $props();
  const initialData = untrack(() => data);
  let cities: Record<string, string> = $state(initialData.cities);
  let city = $state(initialData.city);
  // Limit SSR output; client loads full catalog after hydration.
  let stations: Station[] = $state(
    sortStations(initialData.stations).slice(0, INITIAL_STATION_COUNT),
  );
  let query = $state("");
  let inputQuery = $state("");
  let loading = $state(initialData.stations.length === 0 && !initialData.error);
  let error = $state(initialData.error);
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
  } | null = null;
  let theme = $state("system");
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

  onMount(() => {
    const saved = loadPreferences(localStorage);
    const preferredCity = saved.cityId || city;
    rangeMeters = saved.rangeMeters || DEFAULT_PREFERENCES.rangeMeters;
    theme = saved.theme;
    document.cookie = `bgpp-city=${encodeURIComponent(preferredCity)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if (theme !== "system") document.documentElement.dataset.theme = theme;
    applyAccentStyles(theme);
    if (preferredCity !== city) {
      city = preferredCity;
      stations = [];
      loading = true;
    } else {
      stations = initialData.stations;
    }
    void loadFavorites();
    void loadStations();
    getCities()
      .then((availableCities) => {
        cities = availableCities;
        if (!Object.hasOwn(cities, city)) {
          city = Object.keys(cities)[0] || "";
          stations = [];
          loading = true;
          document.cookie = `bgpp-city=${encodeURIComponent(city)}; Path=/; Max-Age=31536000; SameSite=Lax`;
          void loadStations();
        }
      })
      .catch((cause) => {
        if (!stations.length) error = message(cause);
      });
  });

  function message(cause: unknown): string {
    return cause instanceof Error ? cause.message : "Something went wrong.";
  }

  async function loadStations() {
    if (!city) return;
    const requestedCity = city;
    loading = stations.length === 0;
    error = "";
    try {
      const cached = await getStations(requestedCity);
      if (requestedCity !== city) return;
      if (cached.length) {
        stations = cached.map((station) => ({
          name: station.name,
          uid: station.uid,
          id: station.id,
          coords: [station.lat, station.lon],
          lines: [],
        }));
        loading = false;
      }
      try {
        const refreshed = await syncCity(requestedCity);
        if (requestedCity === city) {
          stations = refreshed.map((station) => ({
            name: station.name,
            uid: station.uid,
            id: station.id,
            coords: [station.lat, station.lon],
            lines: [],
          }));
        }
      } catch (cause) {
        if (cached.length) return;
        if (requestedCity === "bg") {
          const response = await getBelgradeStops();
          if (requestedCity === city)
            stations = response.stops.map((stop) => ({
              ...stop,
              uid: stop.id,
              lines: [],
            }));
        } else {
          const fallback = await getStationsFromApi(requestedCity);
          if (requestedCity === city) stations = fallback;
        }
        if (!stations.length) throw cause;
      }
    } catch (cause) {
      if (requestedCity === city && !stations.length) error = message(cause);
    } finally {
      if (requestedCity === city) loading = false;
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
    settingsSnapshot = { city, rangeMeters, theme };
    settingsOpen = true;
    await tick();
    settingsDialog?.showModal();
  }

  function cancelSettings() {
    if (settingsSnapshot) {
      city = settingsSnapshot.city;
      rangeMeters = settingsSnapshot.rangeMeters;
      theme = settingsSnapshot.theme;
    }
    settingsSnapshot = null;
    settingsOpen = false;
  }

  async function saveSettings() {
    const cityChanged = settingsSnapshot?.city !== city;
    settingsSnapshot = null;
    if (cityChanged) {
      document.cookie = `bgpp-city=${encodeURIComponent(city)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      stations = [];
      origin = null;
      locationMode = false;
      locationEnabled = false;
      query = "";
      inputQuery = "";
    }
    settingsDialog?.close();
    applyTheme(theme);
    savePreferences(localStorage, {
      ...loadPreferences(localStorage),
      cityId: city,
      rangeMeters,
      theme: theme as "system" | "light" | "dark",
    });
    settingsOpen = false;
    await loadFavorites();
    await loadStations();
  }
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
    <a
      class="icon-button compact-favorites"
      href="/favorites"
      aria-label="Favorite stations"
      title="Favorite stations"><AppIcon name="favorite" /></a
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
        <option value="system">Device</option><option value="light"
          >Light</option
        ><option value="dark">Dark</option>
      </select>
      <div class="dialog-actions">
        <button
          type="button"
          class="secondary-button"
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
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }
</style>
