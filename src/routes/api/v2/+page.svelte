<script lang="ts">
  import { Card, Button } from "m3-svelte";
</script>

<svelte:head><title>API reference | Serbia++</title></svelte:head>
<main class="api-page">
  <header class="appbar">
    <a class="icon-button" href="/" aria-label="Back to stations">←</a>
    <div class="appbar-title"><strong>API reference</strong></div>
  </header>
  <div class="api-content">
    <h1>API reference</h1>
    <p>
      Currently registered Serbia++ API routes. City parameters use configured
      city keys.
    </p>
    <Card variant="outlined">
      <h2>Stations and lines</h2>
      <dl>
        <dt><code>GET /api/cities</code></dt>
        <dd>Returns available city mapping.</dd>
        <dt><code>GET /api/stations/:city/all</code></dt>
        <dd>Returns station data for city.</dd>
        <dt><code>GET /api/stations/:city/hash</code></dt>
        <dd>
          Returns <code>{'{"hash":"…"}'}</code> for city station data.
        </dd>
        <dt><code>GET /api/stations/:city/search?uid=:uid</code></dt>
        <dd>
          Looks up station data by UID. Pass <code>id</code>
          instead of <code>uid</code>.
        </dd>
        <dt>
          <code
            >GET /api/stations/:city/schedule?uid=:uid&amp;date=YYYY-MM-DD</code
          >
        </dt>
        <dd>
          Returns schedule data for station. <code>date</code> is optional.
        </dd>
        <dt><code>GET /api/lines/:city</code></dt>
        <dd>Returns lines mapping for city.</dd>
      </dl>
    </Card>
    <Card variant="outlined">
      <h2>Belgrade</h2>
      <dl>
        <dt><code>GET /api/bg/stops</code></dt>
        <dd>Returns Belgrade stops dataset.</dd>
        <dt><code>GET /api/bg/stop?stopId=:id</code></dt>
        <dd>Fetches stop data for numeric stop ID.</dd>
        <dt><code>GET /api/bg/vehicles?stopId=:id</code></dt>
        <dd>Fetches vehicle positions for numeric stop ID.</dd>
        <dt><code>GET /api/bg/routes/:lineId/:threadId?stopId=:id</code></dt>
        <dd>Fetches route using numeric line, thread, and stop IDs.</dd>
      </dl>
    </Card>
    <Card variant="outlined">
      <h2>Routes and alerts</h2>
      <dl>
        <dt><code>GET /api/route?coords=lon,lat;lon,lat</code></dt>
        <dd>Requests route for one or more coordinate pairs.</dd>
        <dt><code>GET /api/v2/alerts/vapid-key</code></dt>
        <dd>
          Returns configured public VAPID key; responds with error when push
          alerts are not configured.
        </dd>
        <dt><code>PUT /api/v2/alerts</code></dt>
        <dd>
          Replaces alerts for submitted push subscription and alert payload.
        </dd>
        <dt><code>DELETE /api/v2/alerts</code></dt>
        <dd>Removes submitted push subscription.</dd>
      </dl>
    </Card>
    <Button variant="tonal" href="/">Back to stations</Button>
  </div>
</main>

<style>
  .api-page {
    min-height: 100dvh;
  }
  .api-content {
    display: grid;
    width: min(100%, 720px);
    gap: 16px;
    margin: 0 auto;
    padding: 24px 16px;
  }
  .api-content h1 {
    margin: 0;
  }
  .api-content p {
    margin: 0;
    color: var(--m3c-on-surface-variant);
  }
  .api-content h2 {
    margin: 0 0 12px;
  }
  .api-content dl {
    margin: 0;
  }
  .api-content dt {
    padding-top: 8px;
  }
  .api-content dd {
    margin: 2px 0 8px;
    color: var(--m3c-on-surface-variant);
  }
  .api-content code {
    color: var(--m3c-primary);
  }
</style>
