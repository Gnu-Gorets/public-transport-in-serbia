# Yandex Belgrade Transit Data

## Route and stop extraction

1. Fetch `buses`, `trolleybuses`, `minibuses`, and `trams` category pages as anonymous GETs. Parse `state-view` JSON and collect route metadata from `masstransit.vehicles`. This is live, viewport-sensitive data, not complete route index; compare multiple map centers.
2. Fetch each public route page at `/maps/10522/belgrade/routes/{type}_{seoname}/{Buffer.from(uri).toString("hex")}/`.
3. Parse `config.masstransitLine.features`. Match directions by `ThreadMetaData.lineId`; `ThreadMetaData.id` identifies direction. Stop features contain `{id, name, coordinates: [longitude, latitude]}`; geometry features contain `points`.
4. Merge stops by ID, preserve existing records, store coordinates as `[latitude, longitude]`, and add route references. Keep `complete: false` unless source coverage is independently proven complete.

Never store Yandex cookies, session IDs, or CSRF tokens.
