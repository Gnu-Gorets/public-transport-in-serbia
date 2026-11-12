# Yandex Belgrade Transit Data

`yandex-belgrade-bus-stops.json` contains 110 Yandex routes and 2,335 unique Yandex stops. The catalog includes buses, trams, minibuses, and trolleybuses. `updatedAt` records the last refresh. `complete` stays `false` because Yandex does not expose a documented complete route index.

## Collection and merge

1. Query the public Yandex transport category pages for buses, trolleybuses, minibuses, and trams at multiple map centers. The 2026-11-12 refresh checked 16 centers: central Belgrade, Novi Beograd, Zemun, Surčin, Zvezdara, Palilula, Voždovac, Rakovica, Čukarica, Grocka, Obrenovac, Barajevo, Sopot, Mladenovac, Lazarevac, and Mali Požarevac. Category results can vary by viewport, so a center is a discovery sample, not a completeness guarantee.
2. Deduplicate routes by Yandex `lineId` and transport type. For each new route, fetch its public route page at `/maps/10522/belgrade/routes/{type}_{seoname}/{Buffer.from(uri).toString("hex")}/`.
3. Parse `config.masstransitLine.features`. Each direction is identified by `ThreadMetaData.id`; `ThreadMetaData.lineId` identifies the route. Stop features contain `{id, name, coordinates: [longitude, latitude]}`. Geometry features contain `points`.
4. Merge stops by Yandex stop ID. Keep existing names and coordinates. Add new route references to existing stops, and append previously unseen stops. Store coordinates as `[latitude, longitude]`.
5. Check duplicate IDs, route references, coordinate bounds, and all collected directions. Keep `complete: false` unless Yandex coverage can be independently proven complete.

The 2026-11-12 refresh added 18 route IDs and 210 unique stops. It scanned 16 centers, but the map's category data is not a complete, documented route index. Other routes may still be missing.

Never store Yandex cookies, session IDs, or CSRF tokens.
