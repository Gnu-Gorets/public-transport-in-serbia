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
  import { validMapCoords } from "./coordinates.ts";

  interface Vehicle {
    lineNumber: string | number;
    garageNo?: string | number;
    coords: [number, number] | null;
  }

  interface Props {
    stations?: Station[];
    selectedStation?: Station | null;
    vehicles?: Vehicle[];
    onSelect?: (station: Station) => void;
  }

  let {
    stations = [],
    selectedStation = null,
    vehicles = [],
    onSelect = () => {},
  }: Props = $props();

  let mapElement: HTMLDivElement;
  let map: Leaflet.Map | undefined;
  let markerGroup: Leaflet.MarkerClusterGroup | undefined;
  let vehicleGroup: Leaflet.LayerGroup | undefined;
  let leaflet: typeof import("leaflet") | undefined;
  let lastSelectedStation: Station | null = null;
  let destroyed = false;

  function createIcon(selected: boolean) {
    return leaflet!.divIcon({
      className: "station-marker-wrapper",
      html: `<span class="station-marker${selected ? " selected" : ""}"></span>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }

  function rebuildMarkers(
    currentStations: Station[],
    currentSelection: Station | null,
    currentVehicles: Vehicle[],
  ) {
    if (!leaflet || !markerGroup || !vehicleGroup) return;
    markerGroup.clearLayers();
    vehicleGroup.clearLayers();
    for (const station of currentStations) {
      const coords = validMapCoords(station.coords);
      if (!coords) continue;

      const marker = leaflet
        .marker(coords, {
          icon: createIcon(station.uid === currentSelection?.uid),
          title: station.name,
          alt: station.name,
          keyboard: true,
          zIndexOffset: station.uid === currentSelection?.uid ? 10000 : 0,
        })
        .on("click", () => onSelect(station));
      const tooltip = document.createElement("span");
      tooltip.textContent = station.name;
      marker.bindTooltip(tooltip, {
        permanent: station.uid === currentSelection?.uid,
        direction: "top",
        offset: [0, -12],
      });
      markerGroup.addLayer(marker);
    }
    for (const vehicle of currentVehicles) {
      const coords = validMapCoords(vehicle.coords);
      if (!coords) continue;
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      icon.classList.add("station-vehicle-marker");
      icon.setAttribute("viewBox", "0 0 32 24");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML =
        '<rect x="2" y="1" width="28" height="19" rx="5"/><rect class="bus-sign" x="9" y="3" width="14" height="7" rx="1.5"/><rect class="bus-window" x="4" y="12" width="5" height="4" rx="1"/><rect class="bus-window" x="11" y="12" width="5" height="4" rx="1"/><rect class="bus-window" x="18" y="12" width="5" height="4" rx="1"/><rect class="bus-window" x="25" y="12" width="3" height="4" rx="1"/><circle class="bus-wheel" cx="8" cy="20" r="2.5"/><circle class="bus-wheel" cx="24" cy="20" r="2.5"/>';
      const routeNumber = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      routeNumber.setAttribute("x", "16");
      routeNumber.setAttribute("y", "8.5");
      routeNumber.textContent = String(vehicle.lineNumber);
      icon.append(routeNumber);
      const description = `Line ${vehicle.lineNumber}`;
      vehicleGroup.addLayer(
        leaflet
          .marker(coords, {
            icon: leaflet.divIcon({
              className: "station-vehicle-marker-wrapper",
              html: icon,
              iconSize: [32, 24],
              iconAnchor: [16, 12],
            }),
            title: description,
            alt: description,
            zIndexOffset: 5000,
          })
          .bindTooltip(description),
      );
    }
    markerGroup.refreshClusters();
  }

  function focusSelection(
    selection: Station | null,
    currentVehicles: Vehicle[],
  ) {
    if (!map || !selection) return;
    const bounds = [
      validMapCoords(selection.coords),
      ...currentVehicles.map((vehicle) => validMapCoords(vehicle.coords)),
    ].filter((coords): coords is [number, number] => coords !== null);
    if (bounds.length > 1)
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    else
      map.setView(validMapCoords(selection.coords) || [44, 20], 12, {
        animate: false,
      });
  }

  $effect(() => {
    const currentStations = stations;
    const currentSelection = selectedStation;
    const currentVehicles = vehicles;
    if (map) {
      rebuildMarkers(currentStations, currentSelection, currentVehicles);
      if (currentSelection !== lastSelectedStation)
        focusSelection(currentSelection, currentVehicles);
      lastSelectedStation = currentSelection;
    }
  });

  onMount(async () => {
    const L = await import("leaflet");
    await import("leaflet.markercluster");
    if (destroyed) return;

    leaflet = L.default;
    map = leaflet.map(mapElement).setView([44, 20], 7);
    leaflet
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      })
      .addTo(map);
    markerGroup = leaflet.markerClusterGroup({
      chunkedLoading: true,
      iconCreateFunction: (cluster) =>
        leaflet!.divIcon({
          className: "station-cluster",
          html: `<span title="${cluster.getChildCount()} stations">${cluster.getChildCount()}</span>`,
          iconSize: [44, 44],
        }),
    });
    map.addLayer(markerGroup);
    vehicleGroup = leaflet.layerGroup().addTo(map);
    rebuildMarkers(stations, selectedStation, vehicles);
    focusSelection(selectedStation, vehicles);
    lastSelectedStation = selectedStation;
  });

  onDestroy(() => {
    destroyed = true;
    map?.remove();
    map = undefined;
    markerGroup = undefined;
    vehicleGroup = undefined;
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
  :global(.station-vehicle-marker-wrapper) {
    display: grid;
    place-items: center;
  }

  :global(.station-vehicle-marker) {
    overflow: visible;
    fill: #1565c0;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 40%));
  }

  :global(.station-vehicle-marker .bus-sign),
  :global(.station-vehicle-marker .bus-window) {
    fill: #fff;
  }

  :global(.station-vehicle-marker .bus-wheel) {
    fill: #263238;
  }

  :global(.station-vehicle-marker text) {
    fill: #1565c0;
    font-size: 6px;
    font-weight: 700;
    text-anchor: middle;
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
    border: 2px solid var(--m3c-on-secondary-container);
    border-radius: 50%;
    background: var(--m3c-secondary-container);
    box-shadow: 0 1px 5px rgb(0 0 0 / 32%);
  }

  :global(.station-marker.selected) {
    width: 34px;
    height: 34px;
    border-width: 3px;
    border-color: var(--m3c-on-tertiary-container);
    background: var(--m3c-tertiary-container);
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
