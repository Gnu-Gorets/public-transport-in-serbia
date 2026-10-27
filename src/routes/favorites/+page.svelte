<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { loadPreferences } from "#lib/state/preferences.ts";
  import { getFavorites, syncCity } from "#lib/stations/storage.js";
  import type { Station } from "#lib/stations.ts";

  let city = $state("");
  let cityName = $state("");
  let stations: Station[] = $state([]);
  let favorites: Station[] = $state([]);
  let error = $state("");
  let loading = $state(true);

  onMount(async () => {
    try {
      const saved = loadPreferences(localStorage);
      const cities = (await fetch("/api/cities").then((response) =>
        response.json(),
      )) as Record<string, string>;
      city =
        saved.cityId && saved.cityId in cities
          ? saved.cityId
          : Object.keys(cities)[0] || "";
      cityName = cities[city] || "";
      const [rows, savedFavorites] = await Promise.all([
        syncCity(city),
        getFavorites(),
      ]);
      stations = rows.map((station) => ({
        name: station.name,
        uid: station.uid,
        id: station.id,
        coords: [station.lat, station.lon],
      }));
      const ids = new Set(
        savedFavorites
          .filter((station) => station.city === city)
          .map((station) => station.id),
      );
      favorites = stations.filter((station) => ids.has(station.id));
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "Unable to load favorites.";
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Favorite stations | Serbia++</title></svelte:head>
<div class="shell">
  <nav class="navigation-rail" aria-label="Main navigation">
    <a class="nav-link" href="/" aria-label="Nearby stations">⌕</a>
    <a
      class="nav-link"
      href="/favorites"
      aria-label="Favorite stations"
      aria-current="page">♡</a
    >
    <a class="nav-link" href="/map" aria-label="Station map">⌖</a>
  </nav>
  <header class="appbar">
    <button
      class="icon-button compact-back"
      aria-label="Back to search"
      onclick={() => goto("/")}>←</button
    >
    <div class="appbar-title">
      <strong>Favorite stations</strong><small>{cityName}</small>
    </div>
  </header>
  <main id="main" class="content">
    {#if loading}<div class="empty" role="status">Loading favorites…</div>
    {:else if error}<div class="empty error" role="alert">{error}</div>
    {:else if favorites.length === 0}<div class="empty">
        You don't have any favorite stations yet.
      </div>
    {:else}
      <div class="station-list" aria-label="Favorite stations">
        {#each favorites as station (`${city}:${station.id}`)}
          <a
            class="station-row"
            href={`/stations/${encodeURIComponent(city)}/${encodeURIComponent(String(station.uid))}`}
          >
            <span class="station-pin" aria-hidden="true">⌖</span>
            <span
              ><strong>{station.name}</strong><span class="station-meta"
                >↔ {station.id}</span
              ></span
            >
            <span aria-hidden="true">♥</span>
          </a>
        {/each}
      </div>
    {/if}
  </main>
  <section class="detail-pane"></section>
</div>

<style>
  .compact-back {
    display: none;
  }
  @media (max-width: 599px) {
    .compact-back {
      display: inline-grid;
    }
  }
</style>
