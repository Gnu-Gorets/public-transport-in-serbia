<script lang="ts">
  import { onMount } from "svelte";
  import { startLocalAlertMonitor } from "#lib/state/local-alerts.ts";
  import "../theme.css";
  import "../app.css";
  import "@fontsource-variable/roboto";

  let { children } = $props();
  let notice = $state("");

  onMount(() => {
    const stop = startLocalAlertMonitor();
    const handleAlert = (event: Event) => {
      notice = (event as CustomEvent<{ message: string }>).detail.message;
      setTimeout(() => (notice = ""), 8000);
    };
    window.addEventListener("arrival-alert", handleAlert);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/service-worker.js");
    return () => {
      stop();
      window.removeEventListener("arrival-alert", handleAlert);
    };
  });
</script>

{@render children()}
{#if notice}<div class="alert-notice" role="status">{notice}</div>{/if}

<style>
  .alert-notice {
    position: fixed;
    z-index: 20;
    right: 16px;
    bottom: 24px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 16px 20px;
    border-radius: 16px;
    color: var(--m3c-on-primary-container);
    background: var(--m3c-primary-container);
    box-shadow: var(--m3-elevation-2);
  }
</style>
