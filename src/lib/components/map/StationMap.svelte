<script module lang="ts">
  export interface Station {
    uid: string | number;
    id?: string | number;
    name: string;
    coords: [number, number];
  }
</script>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type * as Leaflet from "leaflet";

  interface Props {
    stations?: Station[];
    selectedStation?: Station | null;
    onSelect?: (station: Station) => void;
  }

  let {
    stations = [],
    selectedStation = null,
    onSelect = () => {},
  }: Props = $props();

  let mapElement: HTMLDivElement;
  let map: Leaflet.Map | undefined;
  let markerGroup: Leaflet.MarkerClusterGroup | undefined;
  let leaflet: typeof import("leaflet") | undefined;
  let destroyed = false;

  function createIcon(selected: boolean) {
    return leaflet!.divIcon({
      className: "station-marker-wrapper",
      html: `<span class="station-marker${selected ? " selected" : ""}"></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function rebuildMarkers(
    currentStations: Station[],
    currentSelection: Station | null,
  ) {
    if (!leaflet || !markerGroup) return;
    markerGroup.clearLayers();
    for (const station of currentStations) {
      if (
        !Array.isArray(station.coords) ||
        station.coords.length !== 2 ||
        !station.coords.every(Number.isFinite)
      )
        continue;

      const marker = leaflet
        .marker(station.coords, {
          icon: createIcon(station.uid === currentSelection?.uid),
          title: station.name,
          alt: station.name,
          keyboard: true,
        })
        .on("click", () => onSelect(station));
      const tooltip = document.createElement("span");
      tooltip.textContent = station.name;
      marker.bindTooltip(tooltip);
      markerGroup.addLayer(marker);
    }
    markerGroup.refreshClusters();
  }

  $effect(() => {
    const currentStations = stations;
    const currentSelection = selectedStation;
    if (map) {
      rebuildMarkers(currentStations, currentSelection);
      if (currentSelection)
        map.setView(currentSelection.coords, 12, { animate: false });
    }
  });

  onMount(async () => {
    const L = await import("leaflet");
    await import("leaflet.markercluster");
    if (destroyed) return;

    leaflet = L;
    map = L.map(mapElement).setView([44, 20], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    markerGroup = L.markerClusterGroup({
      chunkedLoading: true,
      iconCreateFunction: (cluster) =>
        L.divIcon({
          className: "station-cluster",
          html: `<span>${cluster.getChildCount()}</span>`,
          iconSize: [44, 44],
        }),
    });
    map.addLayer(markerGroup);
    rebuildMarkers(stations, selectedStation);
    if (selectedStation)
      map.setView(selectedStation.coords, 12, { animate: false });
  });

  onDestroy(() => {
    destroyed = true;
    map?.remove();
    map = undefined;
    markerGroup = undefined;
  });
</script>

<div
  class="station-map"
  bind:this={mapElement}
  role="region"
  aria-label="Station map"
></div>

<style>
  @import "leaflet/dist/leaflet.css";
  @import "leaflet.markercluster/dist/MarkerCluster.css";
  @import "leaflet.markercluster/dist/MarkerCluster.Default.css";

  .station-map {
    width: 100%;
    height: 100%;
    min-height: 320px;
  }

  :global(.station-marker-wrapper),
  :global(.station-cluster) {
    border: 0;
    background: transparent;
  }

  :global(.station-marker) {
    display: block;
    width: 20px;
    height: 20px;
    margin: 1px;
    border: 2px solid var(--m3c-on-secondary-container);
    border-radius: 50%;
    background: var(--m3c-secondary-container);
    box-shadow: 0 1px 5px rgb(0 0 0 / 32%);
  }

  :global(.station-marker.selected) {
    width: 24px;
    height: 24px;
    margin: -1px;
    border-color: var(--m3c-on-primary);
    background: var(--m3c-primary);
  }

  :global(.station-cluster) {
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--m3c-primary-container) 70%,
      transparent
    );
  }

  :global(.station-cluster span) {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 2px solid var(--m3c-on-primary-container);
    border-radius: 50%;
    color: var(--m3c-on-primary-container);
    background: var(--m3c-primary-container);
    font-weight: 700;
  }
</style>
