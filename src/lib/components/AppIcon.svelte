<script lang="ts">
  type IconName =
    | "search"
    | "favorite"
    | "map"
    | "refresh"
    | "more"
    | "clear"
    | "alerts"
    | "back"
    | "location";

  let { name, filled = false }: { name: IconName; filled?: boolean } = $props();
</script>

<svg class="app-icon" aria-hidden="true" viewBox="0 0 24 24">
  {#if name === "search"}
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  {:else if name === "favorite"}
    <path
      d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
      fill={filled ? "currentColor" : "none"}
    />
  {:else if name === "map"}
    <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15m6-12v15" />
  {:else if name === "refresh"}
    <path d="M20 7v5h-5" />
    <path d="M20 12a8 8 0 1 1-2.3-5.7L20 9" />
  {:else if name === "more"}
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  {:else if name === "clear"}
    <path d="m18 6-12 12M6 6l12 12" />
  {:else if name === "alerts"}
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
  {:else if name === "back"}
    <path d="M19 12H5m7 7-7-7 7-7" />
  {:else}
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
  {/if}
</svg>
