<script lang="ts">
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import AppIcon from "#lib/components/AppIcon.svelte";
  import {
    DEFAULT_PREFERENCES,
    loadPreferences,
    savePreferences,
  } from "#lib/state/preferences.ts";
  import { applyAccentStyles, applyTheme } from "#lib/state/theme.ts";
  import { getCities } from "#lib/api.ts";
  import { getFavorites } from "#lib/stations/storage.js";
  import type { StationRecord } from "#lib/stations/storage.js";
  import { searchStations, type Station } from "#lib/stations.ts";

  let city = $state("");
  let cityName = $state("");
  let cities: Record<string, string> = $state({});
  let favoriteRecords: StationRecord[] = $state([]);
  let favorites: Station[] = $derived(
    favoriteRecords
      .filter((favorite) => favorite.city === city)
      .map((favorite) => ({
        id: favorite.id,
        uid: favorite.uid,
        name: favorite.name,
        coords: [favorite.lat, favorite.lon] as [number, number],
      })),
  );
  let error = $state("");
  let loading = $state(true);
  let query = $state("");
  let filtered = $derived(searchStations(favorites, query));
  let rangeMeters = $state(DEFAULT_PREFERENCES.rangeMeters);
  let theme = $state("system");
  let settingsOpen = $state(false);
  let settingsDialog = $state<HTMLDialogElement>();
  let settingsSnapshot: {
    city: string;
    rangeMeters: number;
    theme: string;
  } | null = null;

  onMount(() => {
    const saved = loadPreferences(localStorage);
    city = saved.cityId || "bg";
    cityName = city === "bg" ? "Belgrade" : "";
    rangeMeters = saved.rangeMeters || DEFAULT_PREFERENCES.rangeMeters;
    theme = saved.theme;
    if (theme !== "system") document.documentElement.dataset.theme = theme;
    applyAccentStyles(theme);

    void getFavorites()
      .then((rows) => {
        favoriteRecords = rows;
        error = "";
      })
      .catch((cause) => {
        error =
          cause instanceof Error ? cause.message : "Unable to load favorites.";
      })
      .finally(() => (loading = false));

    void getCities()
      .then((availableCities) => {
        cities = availableCities;
        if (!Object.hasOwn(cities, city)) city = Object.keys(cities)[0] || "";
        cityName = cities[city] || "";
      })
      .catch(() => {
        // Favorite rows do not depend on city names.
      });
  });

  function toggleTheme(value: string) {
    theme = value;
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

  function saveSettings() {
    settingsSnapshot = null;
    settingsDialog?.close();
    applyTheme(theme);
    savePreferences(localStorage, {
      ...loadPreferences(localStorage),
      cityId: city,
      rangeMeters,
      theme: theme as "system" | "light" | "dark",
    });
    cityName = cities[city] || "";
    settingsOpen = false;
  }
</script>

<svelte:head><title>Favorite stations | Serbia++</title></svelte:head>
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
      title="Favorite stations"
      aria-current="page"><AppIcon name="favorite" /></a
    >
    <a class="nav-link" href="/map" aria-label="Station map" title="Station map"
      ><AppIcon name="map" /></a
    >
  </nav>
  <header class="appbar">
    <button
      class="icon-button compact-back"
      aria-label="Back to search"
      title="Back to search"
      onclick={() => goto("/")}><AppIcon name="back" /></button
    >
    <div class="appbar-title">
      <strong>Favorite stations</strong><small>{cityName}</small>
    </div>
    <button
      class="icon-button"
      aria-label="Preferences"
      title="Preferences"
      onclick={openSettings}><AppIcon name="more" /></button
    >
  </header>
  <main id="main" class="content">
    {#if loading}<div class="empty" role="status">Loading favorites…</div>
    {:else if error}<div class="empty error" role="alert">{error}</div>
    {:else if favorites.length === 0}<div class="empty">
        You don't have any favorite stations yet.
      </div>
    {:else}
      {#if favorites.length > 0}
        <div class="search-row">
          <input
            class="search-input"
            type="search"
            aria-label="Search favorite stations"
            placeholder="Search favorite stations"
            bind:value={query}
          />
        </div>
      {/if}
      {#if query.trim() && filtered.length === 0}
        <div class="empty">No favorite stations match your search.</div>
      {:else}
        <div class="station-list" aria-label="Favorite stations">
          {#each query.trim() ? filtered : favorites as station (`${city}:${station.id}`)}
            <a
              class="station-row"
              href={`/stations/${encodeURIComponent(city)}/${encodeURIComponent(String(station.uid))}`}
            >
              <span class="station-pin"><AppIcon name="location" /></span>
              <span
                ><strong>{station.name}</strong><span class="station-meta"
                  >↔ {station.id}</span
                ></span
              >
              <AppIcon name="favorite" filled />
            </a>
          {/each}
        </div>
      {/if}
    {/if}
  </main>
  <section class="detail-pane"></section>
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
  .compact-back {
    display: none;
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
  @media (max-width: 599px) {
    .compact-back {
      display: inline-grid;
    }
  }
</style>
