let currInterval;
let map, layerGroup;
let nearbyMap, nearbyLayerGroup;
let lastUserLocation;
let currQuery;
let allStations = {};
let allLines = {};
let mapInitialized = false;
let currentPolyline = null;
let genericRequestId = 0;
let arrivalRequestId = 0;
let scheduleLoadedKey = null;
let scheduleRequestId = 0;
let currentCity;
let bgStopCentered = false;
let bgStopRequest;
let bgStopRequestId = 0;
let bgStopId;
let bgStopMarker;
let bgStopCoords;
let bgVehicleLayer;
let bgVehicleRequestId = 0;
let bgRouteData;
let bgRouteSelection;

const coloredIcon = (color) => {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -14],
    shadowSize: [41, 41],
  });
};

const createMarker = (
  coords,
  name = undefined,
  color = "blue",
  popupText = undefined,
) => {
  let marker = new L.marker(coords, { icon: coloredIcon(color) });
  if (popupText) {
    const popup = document.createElement("span");
    popup.textContent = popupText;
    marker.bindPopup(popup, { autoClose: false, closeOnClick: false });
  }
  if (name) {
    const tooltip = document.createElement("span");
    tooltip.textContent = name;
    marker.bindTooltip(tooltip, {
      permanent: true,
      direction: "center",
      className: "my-labels",
    });
  }
  return marker;
};

const doAsyncRequest = async (url, type = "GET", data = {}, errorHandler) => {
  if (!url) throw new Error("No URL provided");

  try {
    let response = await $.ajax({
      url: url,
      type: type,
      data: data,
    });
    return response;
  } catch (error) {
    console.error("Error sending request:", error);

    let errorMessage = "Unknown error";
    if (error.responseJSON?.message) {
      errorMessage = error.responseJSON.message;
    } else if (error.status) {
      errorMessage = `HTTP ${error.status}: ${error.statusText}`;
    }

    console.error(
      `Request failed! URL: ${url}, Status: ${error.status}, Response:`,
      error.responseText,
    );

    if (errorHandler?.(error) !== true) {
      const dialog = document.getElementById("arrivalsDialog");
      const target = dialog && !dialog.open ? "#searchError" : "#error";
      $(target).text(`Error updating data: ${errorMessage}`).show();
    }
  }
};

const fetchCityStations = async (city) => {
  const isBelgrade = city === "bg";
  const response = await doAsyncRequest(
    isBelgrade ? "/api/bg/stops" : `/api/stations/${city}/all`,
    "GET",
    undefined,
    isBelgrade ? undefined : () => city !== getCity(),
  );
  allStations[city] = isBelgrade
    ? (response?.stops || []).map((stop) => ({ ...stop, uid: stop.id }))
    : response;
};

const fetchCityLines = async (city) => {
  const response = await doAsyncRequest(
    `/api/lines/${city}`,
    "GET",
    undefined,
    () => city !== getCity(),
  );
  allLines[city] = response;
};

const moveMapToCityCentre = (city) => {
  const cityCentres = {
    bg: [44.81254796404323, 20.46145496621977],
    ns: [45.267136, 19.833549],
    nis: [43.3209, 21.8958],
  };

  if (!currInterval) map.setView(cityCentres[city], 13, { animation: true });
};

const getSearchMode = () => {
  return $("#searchMode").val();
};

const getCity = () => {
  const city = $("#city").val();
  return city ? encodeURIComponent(city) : "";
};

const onCityChange = async () => {
  const city = getCity();
  const cityChanged = city !== currentCity;
  const dialog = document.getElementById("arrivalsDialog");
  if (cityChanged && dialog?.open) closeArrivalsDialog();
  const isBelgrade = city === "bg";
  const wasBelgrade = currentCity === "bg";
  if (!city) {
    currInterval = clearInterval(currInterval);
    genericRequestId++;
    scheduleRequestId++;
    currQuery = undefined;
    layerGroup?.clearLayers();
    currentCity = undefined;
    $("#stationControls").hide();
    $("#chooseCityMessage").show();
    return;
  }
  currentCity = city;
  $("#stationControls").toggle(Boolean(city));
  $("#chooseCityMessage").toggle(!city);
  $("#searchMode option[value=coords]")
    .prop("hidden", isBelgrade)
    .prop("disabled", isBelgrade);
  $(
    "#updateInProgress, #stationName, #lastUpdated, #busRouteInfo, #error, #noBusesMessage, #tableContainer, #scheduleSection",
  ).hide();
  $("#searchError, #searchLoading").hide();

  currInterval = clearInterval(currInterval);
  layerGroup.clearLayers();
  currentPolyline = null;
  genericRequestId++;
  scheduleRequestId++;
  currQuery = undefined;
  if (isBelgrade || wasBelgrade) {
    bgVehicleRequestId++;
    bgVehicleLayer = undefined;
    bgStopMarker = undefined;
    bgStopCoords = undefined;
    bgStopId = undefined;
  }
  if (isBelgrade) {
    $("#searchMode").val("name");
    onSearchModeChange();
    bgStopCentered = false;
    bgRouteData = undefined;
    bgRouteSelection = undefined;
    layerGroup.clearLayers();
    $("#name-input").val("");
    $("#thead th").eq(1).text("Arrival time");
    $("#thead th").eq(2).text("Destination");
    moveMapToCityCentre(city);
    return;
  }

  $("#thead th").eq(1).text("ETA");
  $("#thead th").eq(2).text("Route");
  $("#noBusesMessage").text(
    "Currently, there are no buses scheduled to arrive at this stop.",
  );
  moveMapToCityCentre(city);
  const promises = [];
  if (!allStations[city]) promises.push(fetchCityStations(city));
  await Promise.all(promises);
};

const onSearchModeChange = () => {
  const searchMode = $("#searchMode").val();
  $("#searchMode option")
    .toArray()
    .forEach((option) => {
      const value = $(option).val();
      $(`.${value}-search`).toggle(value === searchMode);
    });
  $("#submit").toggle(searchMode !== "name");
  if (searchMode === "coords" && nearbyMap)
    setTimeout(() => nearbyMap.invalidateSize(), 50);
};

const formatSeconds = (seconds) => {
  let minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
};

const updateStationHeader = (name) => {
  $("#stationName").text(`Station: ${name}`).show();
  $("#lastUpdated")
    .text(
      `Last updated: ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Belgrade" })} (auto refresh - 60 seconds)`,
    )
    .show();
  $("#updateInProgress").hide();
};

const updateArrivals = (response, recenter) => {
  const name = `${response.name} (${response.id})`;
  updateStationHeader(name);

  layerGroup.clearLayers();
  if (recenter) map.setView(response.coords, 13, { animation: true });

  let markers = [];
  markers.push(createMarker(response.coords, "", "yellow", name));

  if (response.vehicles.length === 0) {
    L.featureGroup(markers).addTo(layerGroup);
    if (recenter) map.setView(response.coords, 15, { animate: false });
    $("#busRouteInfo").hide();
    $("#tableContainer").hide();
    $("#noBusesMessage").show();
    return;
  }

  $("#noBusesMessage").hide();
  $("#tableContainer").show();
  const city = getCity();
  const uid = response.uid;
  const info = document.getElementById("busRouteInfo");
  info.replaceChildren(
    document.createTextNode("Click on bus number to view its route on map. | "),
  );
  const scheduleLink = document.createElement("a");
  scheduleLink.id = "scheduleToggle";
  scheduleLink.href = "#";
  scheduleLink.style.color = "#1abc9c";
  scheduleLink.textContent = "View schedule";
  scheduleLink.addEventListener("click", (event) => {
    event.preventDefault();
    toggleSchedule(city, uid);
  });
  info.appendChild(scheduleLink);
  $("#busRouteInfo").show();

  const parseLine = (line) => {
    const value = String(line ?? "");
    const match = value.match(/^(\d+)(\D*)/);
    return match ? [Number(match[1]), match[2]] : [Infinity, value];
  };
  response.vehicles.sort((a, b) => {
    const [aNum, aSuffix] = parseLine(a.lineNumber);
    const [bNum, bSuffix] = parseLine(b.lineNumber);
    if (aNum !== bNum) return aNum - bNum;
    const lineOrder = aSuffix.localeCompare(bSuffix);
    if (lineOrder) return lineOrder;
    const aSeconds = Number(a.secondsLeft);
    const bSeconds = Number(b.secondsLeft);
    return (
      (Number.isFinite(aSeconds) ? aSeconds : Infinity) -
      (Number.isFinite(bSeconds) ? bSeconds : Infinity)
    );
  });

  const tableData = response.vehicles.map((value) => {
    const hasCoords =
      Array.isArray(value.coords) &&
      value.coords.length === 2 &&
      value.coords.every(
        (coord) =>
          coord != null &&
          String(coord).trim() &&
          Number.isFinite(Number(coord)),
      );
    if (hasCoords) {
      const marker = createMarker(
        value.coords.map(Number),
        value.lineNumber,
        "blue",
        value.main_line_title,
      );
      marker.on("click", () =>
        addRouteToMap(value.lineNumber, value.allStations),
      );
      markers.push(marker);
    }
    const formattedTime = formatSeconds(value.secondsLeft);
    const row = document.createElement("tr");
    row.addEventListener("click", () =>
      addRouteToMap(value.lineNumber, value.allStations),
    );
    const lineCell = document.createElement("td");
    const lineLink = document.createElement("a");
    lineLink.href = "#";
    lineLink.style.color = "#FFD700";
    lineLink.textContent = value.lineNumber ?? "";
    lineLink.addEventListener("click", (event) => event.preventDefault());
    lineCell.appendChild(lineLink);
    row.appendChild(lineCell);
    for (const text of [
      `${formattedTime === "0 min" ? "At stop (< 1 min)" : formattedTime}${hasCoords ? "" : " · Location unavailable"}`,
      value.main_line_title ?? "",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.appendChild(cell);
    }
    return row;
  });
  $("#tableBody").empty().append(tableData);
  $("#tabela").show();
  let group = L.featureGroup(markers).addTo(layerGroup);
  if (recenter) map.fitBounds(group.getBounds(), { padding: [40, 40] });
};

const updateBgArrivals = (response) => {
  bgStopId = response.id;
  bgVehicleRequestId++;
  const now = Date.now();
  const arrivals = (response.arrivals || [])
    .filter((arrival) => arrival.isEstimated)
    .map((arrival) => ({
      ...arrival,
      timestamp: Date.parse(arrival.estimatedAt || arrival.scheduledAt),
    }))
    .filter(
      (arrival) =>
        Number.isFinite(arrival.timestamp) && arrival.timestamp >= now - 60_000,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  updateStationHeader(response.name);
  $("#busRouteInfo")
    .text("Click on bus number to view its route on map.")
    .show();
  $("#updateInProgress").hide();
  $("#error").hide();
  $("#tableBody").empty();

  const recenter = !bgStopCentered;
  bgStopCoords = response.coords;
  bgStopMarker = createMarker(
    response.coords,
    undefined,
    "yellow",
    response.name,
  );

  if (!arrivals.length) {
    $("#tableContainer").hide();
    $("#noBusesMessage")
      .text("No live arrival estimates are available for this stop.")
      .show();
    drawBgVehicles([], recenter);
    return;
  }

  $("#noBusesMessage").hide();
  $("#tableContainer").show();
  $("#tabela").show();
  const parseLine = (line) => {
    const value = String(line ?? "");
    const match = value.match(/^(\d+)(\D*)/);
    return match ? [Number(match[1]), match[2]] : [Infinity, value];
  };
  arrivals.sort((a, b) => {
    const [aNum, aSuffix] = parseLine(a.lineNumber);
    const [bNum, bSuffix] = parseLine(b.lineNumber);
    return (
      aNum - bNum || aSuffix.localeCompare(bSuffix) || a.timestamp - b.timestamp
    );
  });
  const rows = arrivals.map((arrival) => {
    const row = document.createElement("tr");
    const arrivalTime = new Date(arrival.timestamp).toLocaleTimeString(
      "en-GB",
      {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Belgrade",
      },
    );
    const values = [
      arrival.lineNumber,
      `${arrivalTime} (estimate)`,
      arrival.destination || "—",
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 0 && arrival.route) {
        row.addEventListener("click", () => showBgRoute(arrival.route));
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = value;
        button.style.color = "#FFD700";
        button.setAttribute(
          "aria-label",
          `View route ${value} to ${arrival.destination || "destination"}`,
        );
        cell.appendChild(button);
      } else cell.textContent = value;
      row.appendChild(cell);
    });
    return row;
  });
  $("#tableBody").append(rows);
  if (currQuery) {
    if (Array.isArray(response.vehicles))
      drawBgVehicles(response.vehicles, recenter);
    else return refreshBgVehicles(recenter);
  }
};

const drawBgVehicles = (vehicles = [], recenter = false) => {
  if (recenter) {
    layerGroup.clearLayers();
    bgVehicleLayer = undefined;
    L.featureGroup([bgStopMarker]).addTo(layerGroup);
    if (bgRouteData) drawBgRoute(bgRouteData, false);
  } else if (bgVehicleLayer) layerGroup.removeLayer(bgVehicleLayer);
  bgVehicleLayer = undefined;
  const markers = vehicles
    .filter(
      (vehicle) =>
        Array.isArray(vehicle.coords) &&
        vehicle.coords.length === 2 &&
        vehicle.coords.every(Number.isFinite),
    )
    .map((vehicle) =>
      createMarker(
        vehicle.coords,
        vehicle.lineNumber,
        "blue",
        `Bus ${vehicle.lineNumber}`,
      ),
    );
  if (markers.length)
    bgVehicleLayer = L.featureGroup(markers).addTo(layerGroup);
  if (recenter && bgStopMarker) {
    if (markers.length)
      map.fitBounds(L.featureGroup([bgStopMarker, ...markers]).getBounds(), {
        animate: false,
        padding: [40, 40],
      });
    else map.setView(bgStopCoords, 15, { animate: false });
    bgStopCentered = true;
  }
};

const refreshBgVehicles = async (recenter = false) => {
  const requestId = ++bgVehicleRequestId;
  const query = currQuery;
  const clearLatest = () => {
    if (
      getCity() === "bg" &&
      currQuery === query &&
      requestId === bgVehicleRequestId
    )
      drawBgVehicles([], recenter);
    else return true;
  };
  const response = await doAsyncRequest(
    `/api/bg/vehicles?stopId=${encodeURIComponent(query.uid || bgStopId)}`,
    "GET",
    undefined,
    clearLatest,
  );
  if (
    getCity() !== "bg" ||
    currQuery !== query ||
    requestId !== bgVehicleRequestId
  )
    return;
  drawBgVehicles(
    Array.isArray(response?.vehicles) ? response.vehicles : [],
    recenter,
  );
};

const drawBgRoute = (route, recenter = true) => {
  if (currentPolyline) layerGroup.removeLayer(currentPolyline);
  currentPolyline = L.polyline(route.segments, { color: "blue" }).addTo(
    layerGroup,
  );
  if (recenter) map.fitBounds(currentPolyline.getBounds());
};

const showBgRoute = async (route) => {
  const selection = `${route.lineId}:${route.threadId}`;
  const query = currQuery;
  bgRouteSelection = selection;
  bgRouteData = undefined;
  if (currentPolyline) {
    layerGroup.removeLayer(currentPolyline);
    currentPolyline = null;
  }
  const response = await doAsyncRequest(
    `/api/bg/routes/${encodeURIComponent(route.lineId)}/${encodeURIComponent(route.threadId)}?stopId=${encodeURIComponent(query?.uid || bgStopId)}`,
    "GET",
    undefined,
    () =>
      getCity() !== "bg" ||
      currQuery !== query ||
      bgRouteSelection !== selection,
  );
  if (
    getCity() !== "bg" ||
    currQuery !== query ||
    bgRouteSelection !== selection ||
    !response
  )
    return;
  bgRouteData = response;
  drawBgRoute(response);
};

const fetchBgStop = (openOnSuccess = false) => {
  if (getCity() !== "bg") return Promise.resolve(false);
  if (bgStopRequest) return bgStopRequest;
  const requestId = ++bgStopRequestId;
  const selectionId = genericRequestId;
  const query = currQuery;
  const stopId = query?.uid;
  const isCurrent = () =>
    requestId === bgStopRequestId &&
    selectionId === genericRequestId &&
    getCity() === "bg" &&
    currQuery === query;
  bgStopRequest = (async () => {
    if (document.getElementById("arrivalsDialog")?.open)
      $("#updateInProgress").show();
    $("#error").hide();
    if (!stopId) return false;
    const isStale = () => !isCurrent();
    const [response, vehicleResponse] = await Promise.all([
      doAsyncRequest(
        `/api/bg/stop?stopId=${encodeURIComponent(stopId)}`,
        "GET",
        undefined,
        isStale,
      ),
      doAsyncRequest(
        `/api/bg/vehicles?stopId=${encodeURIComponent(stopId)}`,
        "GET",
        undefined,
        isStale,
      ),
    ]);
    if (!isCurrent()) return false;
    if (!response || !vehicleResponse || currQuery?.uid !== response.uid) {
      $("#updateInProgress").hide();
      if (openOnSuccess) $("#searchLoading").hide();
      return false;
    }
    if (openOnSuccess) {
      if (!openArrivalsDialog()) {
        $("#searchLoading").hide();
        return false;
      }
      $("#searchLoading").hide();
    }
    await updateBgArrivals({
      ...response,
      vehicles: vehicleResponse.vehicles || [],
    });
    return true;
  })().finally(() => {
    if (requestId === bgStopRequestId) bgStopRequest = null;
  });
  return bgStopRequest;
};

const fetchArrivals = async (city, query, recenter) => {
  const selectionId = genericRequestId;
  const requestId = ++arrivalRequestId;
  const isCurrent = () =>
    selectionId === genericRequestId &&
    requestId === arrivalRequestId &&
    city === getCity() &&
    query === currQuery;
  const url = `/api/stations/${city}/search?${$.param(query)}`;
  const dialogOpen = document.getElementById("arrivalsDialog")?.open;
  if (recenter) $("#searchLoading").show();
  else if (dialogOpen) $("#updateInProgress").show();
  $("#error").hide();

  const response = await doAsyncRequest(url, "GET", undefined, (error) => {
    if (!isCurrent()) return true;
    console.error("Error sending request:", error);
    const message = `Error updating data: ${error?.responseJSON?.message || "Invalid response"}`;
    if (recenter) {
      $("#searchLoading").hide();
      $("#searchError").text(message).show();
    } else {
      $("#updateInProgress").hide();
      $("#error").text(message).show();
    }
    return true;
  });

  if (!isCurrent()) return false;
  if (!response) {
    if (recenter) $("#searchLoading").hide();
    else $("#updateInProgress").hide();
    return false;
  }
  if (recenter) {
    if (!openArrivalsDialog()) {
      $("#searchLoading").hide();
      return false;
    }
    $("#searchLoading").hide();
  }
  updateArrivals(response, recenter);
  return true;
};

const spawnInterval = (query = undefined) => {
  if (!query) query = currQuery;
  if (!query) return;

  const city = getCity();
  const selectionId = genericRequestId;
  return fetchArrivals(city, query, true).then((loaded) => {
    if (
      !loaded ||
      selectionId !== genericRequestId ||
      query !== currQuery ||
      city !== getCity()
    )
      return false;
    currInterval = clearInterval(currInterval);
    currInterval = setInterval(() => {
      fetchArrivals(city, query, false);
    }, 60 * 1000);
    return true;
  });
};

const toggleSchedule = (city, uid) => {
  const toggle = document.getElementById("scheduleToggle");
  if ($("#scheduleSection").is(":visible")) {
    $("#scheduleSection").hide();
    if (toggle) toggle.textContent = "View schedule";
  } else {
    fetchSchedule(city, uid);
    if (toggle) toggle.textContent = "Hide schedule";
  }
};

const fetchSchedule = async (city, uid, force = false) => {
  const key = `${city}:${uid}`;
  const requestId = ++scheduleRequestId;
  if (!force && scheduleLoadedKey === key) {
    $("#scheduleSection").show();
    return;
  }
  $("#scheduleSection").hide();
  $("#scheduleInfo").text("Loading schedule...");
  $("#scheduleSection").show();
  $("#scheduleContainer").empty();

  const response = await doAsyncRequest(
    `/api/stations/${city}/schedule?uid=${encodeURIComponent(uid)}`,
    "GET",
    undefined,
    () => requestId !== scheduleRequestId || city !== getCity(),
  );
  if (requestId !== scheduleRequestId || city !== getCity()) return;
  if (!response?.schedule) {
    $("#scheduleInfo").text("Failed to load schedule.");
    return;
  }

  const lines = Object.keys(response.schedule);
  if (!lines.length) {
    $("#scheduleInfo").text("No upcoming departures today.");
    return;
  }

  const parts = response.date.split(/[-/]/);
  const formattedDate =
    parts.length === 3 && parts[0].length === 4
      ? `${parseInt(parts[2])}/${parseInt(parts[1])}/${parts[0]}`
      : response.date;
  $("#scheduleInfo").text(`Schedule for ${formattedDate}:`);

  const container = document.getElementById("scheduleContainer");
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "overflow-x:auto;margin-top:8px";
  const table = document.createElement("table");
  table.style.cssText =
    "color:var(--text);font-size:0.9rem;border-collapse:collapse;width:100%";
  const head = document.createElement("thead");
  const heading = document.createElement("tr");
  const lineHeader = document.createElement("th");
  lineHeader.textContent = "#";
  lineHeader.style.cssText =
    "position:sticky;left:0;background:var(--surface);color:var(--accent);font-size:0.72rem;font-weight:700;letter-spacing:.06em;text-align:left;padding-bottom:4px;border-bottom:1px solid var(--border)";
  const timesHeader = document.createElement("th");
  timesHeader.textContent = "DEPARTURES";
  timesHeader.style.cssText =
    "color:var(--accent);font-size:0.72rem;font-weight:700;letter-spacing:.06em;text-align:left;padding-bottom:4px;border-bottom:1px solid var(--border)";
  heading.append(lineHeader, timesHeader);
  head.appendChild(heading);
  table.appendChild(head);
  const body = document.createElement("tbody");
  for (const line of lines) {
    const row = document.createElement("tr");
    const lineCell = document.createElement("td");
    lineCell.textContent = line;
    lineCell.style.cssText =
      "position:sticky;left:0;background:var(--surface);white-space:nowrap;color:var(--accent);font-size:0.85rem;font-weight:700;padding:3px 10px 3px 0;vertical-align:middle;border-bottom:1px solid var(--border)";
    row.appendChild(lineCell);
    const timesCell = document.createElement("td");
    timesCell.style.cssText =
      "white-space:nowrap;padding:3px 0 5px;border-bottom:1px solid var(--border)";
    for (const time of response.schedule[line]) {
      const nextDay = time.includes("(+24h)");
      const chip = document.createElement("span");
      chip.style.cssText = `display:inline-block;background:var(--surface-muted);padding:2px 6px;border-radius:4px;margin:1px;white-space:nowrap;font-size:0.82rem;${nextDay ? "opacity:0.55" : ""}`;
      chip.textContent = `${time.replace("(+24h)", "").trim()}${nextDay ? "*" : ""}`;
      timesCell.appendChild(chip);
    }
    row.appendChild(timesCell);
    body.appendChild(row);
  }
  table.appendChild(body);
  wrapper.appendChild(table);
  container.replaceChildren(wrapper);
  scheduleLoadedKey = key;
};

const addRouteToMap = async (lineNumber, fallbackStations = []) => {
  if (currentPolyline) {
    layerGroup.removeLayer(currentPolyline);
    currentPolyline = null;
  }

  const city = getCity();
  const cityLines = allLines[city];
  const cityStations = allStations[city];
  const arrivalStops = fallbackStations
    .map((s) => [parseFloat(s.latitude), parseFloat(s.longitude)])
    .filter((coords) => coords.every(Number.isFinite));
  let latlngs = arrivalStops.length > 1 ? arrivalStops : undefined;

  if (!latlngs && (!cityLines || !cityStations)) {
    if (!cityStations) await fetchCityStations(city);
    if (!allLines[city]) await fetchCityLines(city);
  }
  const routeLines = allLines[city];
  const routeStations = allStations[city];
  if (!latlngs && routeLines && routeStations) {
    const stationMap = {};
    routeStations.forEach((s) => {
      stationMap[String(s.uid)] = s.coords;
    });

    for (const dir of ["A", "B"]) {
      const uids = routeLines[`${lineNumber}_${dir}`];
      if (!uids) continue;
      const stops = uids
        .map((uid) => stationMap[String(uid)])
        .filter(
          (coords) =>
            Array.isArray(coords) &&
            coords.length === 2 &&
            coords.every(Number.isFinite),
        );
      if (stops.length > 1) {
        latlngs = stops;
        break;
      }
    }
  }

  if (!latlngs) latlngs = arrivalStops;
  if (latlngs.length < 2) return;

  // shortcut: routes over 2000 characters fall back to straight lines; chunk if a real route exceeds API limit.
  const coords = latlngs.map(([lat, lon]) => `${lon},${lat}`).join(";");
  try {
    const res = await fetch(`/api/route?coords=${encodeURIComponent(coords)}`);
    const data = await res.json();
    if (data.code === "Ok" && data.routes.length > 0) {
      currentPolyline = L.geoJSON(data.routes[0].geometry, {
        style: { color: "blue" },
      }).addTo(layerGroup);
      map.fitBounds(currentPolyline.getBounds(), { padding: [40, 40] });
      return;
    }
  } catch {
    /* fall through */
  }

  currentPolyline = L.polyline(latlngs, { color: "blue" }).addTo(layerGroup);
  map.fitBounds(currentPolyline.getBounds(), { padding: [40, 40] });
};

const initNearbyMap = () => {
  if (nearbyMap || !document.getElementById("nearbyMap")) return;
  nearbyMap = L.map("nearbyMap", {
    center: [44.81254796404323, 20.46145496621977],
    zoom: 13,
  });
  nearbyLayerGroup = L.layerGroup().addTo(nearbyMap);
  L.control.layers(mapLayers).addTo(nearbyMap);
  mapLayers.Transport.addTo(nearbyMap);
};

const initMap = () => {
  if (!mapInitialized) {
    map = L.map("map", {
      center: [44.81254796404323, 20.46145496621977],
      zoom: 13,
    });
    layerGroup = L.layerGroup().addTo(map);

    L.control.layers(mapLayers).addTo(map);
    mapLayers.Transport.addTo(map);

    mapInitialized = true;
  }
};

const canOpenArrivalsDialog = () => {
  const dialog = document.getElementById("arrivalsDialog");
  if (dialog && typeof dialog.showModal === "function") return true;
  $("#searchError").text("This browser does not support modal dialogs.").show();
  return false;
};

const openArrivalsDialog = () => {
  const dialog = document.getElementById("arrivalsDialog");
  if (!dialog || !canOpenArrivalsDialog()) return false;
  if (dialog.open) return true;
  document.body.classList.add("dialog-open");
  dialog.showModal();
  setTimeout(() => map?.invalidateSize?.(), 50);
  return true;
};

const closeArrivalsDialog = () => {
  const dialog = document.getElementById("arrivalsDialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  document.body.classList.remove("dialog-open");
};

const startStationArrivals = (uid) => {
  if (!canOpenArrivalsDialog()) return;
  const city = getCity();
  genericRequestId++;
  scheduleRequestId++;
  currQuery = { uid: String(uid) };
  currInterval = clearInterval(currInterval);
  $("#searchError").hide();
  $("#searchLoading").text("Loading arrivals…").show();

  if (city === "bg") {
    bgStopCentered = false;
    bgStopRequestId++;
    bgStopRequest = null;
    const selectionId = genericRequestId;
    const query = currQuery;
    return fetchBgStop(true).then((loaded) => {
      if (
        !loaded ||
        selectionId !== genericRequestId ||
        query !== currQuery ||
        city !== getCity()
      )
        return false;
      currInterval = setInterval(fetchBgStop, 60 * 1000);
      return true;
    });
  }
  return spawnInterval(currQuery);
};

const submitByName = () => {
  const selectedValue = $("#name-input").val()?.trim();
  if (!selectedValue) return;
  const city = getCity();
  const station = (allStations[city] || []).find(
    (item) => item.name === selectedValue || String(item.id) === selectedValue,
  );
  if (city === "bg" && !station) return;
  return startStationArrivals(station?.uid || selectedValue);
};

const submitByCoords = () => {
  const uid = $("#coords-input").val()?.trim();
  if (!uid) return;
  return startStationArrivals(uid);
};

const toggleTable = () => {
  const tabela = document.getElementsByTagName("table");
  if (!currQuery) {
    for (let i = 0; i < tabela.length; i++) {
      tabela[i].style.display = "none";
    }
  } else {
    for (let i = 0; i < tabela.length; i++) {
      tabela[i].style.display = "table";
    }
  }
};

function onNameChange() {
  submitByName();
  toggleTable();
}

function onRangeChange() {
  const rangeValue = document.getElementById("stationsMaxDistance-input").value;
  document.getElementById("stationsMaxDistance-label").textContent =
    `Maximum distance (${rangeValue}m)`;
  try {
    localStorage.setItem("stationsMaxDistance", rangeValue);
  } catch {
    // Keep nearby search usable when browser storage is unavailable.
  }
  if (lastUserLocation)
    searchByCoords(
      lastUserLocation,
      "#stationsMaxDistance-input",
      "#coords-input",
    );
}

const getUserLocation = async () => {
  return new Promise((resolve, reject) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          resolve(userLocation);
        },
        (error) => {
          $("#searchError").text("Error retrieving location.").show();
          reject(error.message);
        },
      );
    } else {
      reject("Geolocation is not available in this browser.");
    }
  });
};

const getDistanceFromCoords = (lat1, lon1, lat2, lon2) => {
  const earthRadiusInMeters = 6371000; // Earth's radius in meters
  const deltaLat = (lat2 - lat1) * (Math.PI / 180);
  const deltaLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadiusInMeters * c;
  return distance;
};

const findClosestStations = async (
  userLocation,
  stationsArray,
  maxDistance = 300,
) => {
  const stationsWithDistances = stationsArray.map((station) => {
    const distance = getDistanceFromCoords(
      userLocation.latitude,
      userLocation.longitude,
      ...station.coords,
    );
    return { station, distance };
  });

  let closestStations = stationsWithDistances.filter(
    (item) => item.distance <= maxDistance,
  );
  closestStations.sort((a, b) => a.distance - b.distance);

  closestStations = closestStations.map((station) => {
    station.distance = Math.round(station.distance);
    return station;
  });

  return closestStations;
};

const cancelInterval = () => {
  currInterval = clearInterval(currInterval);
  currQuery = undefined;
  genericRequestId++;
  arrivalRequestId++;
  scheduleRequestId++;
  bgStopRequestId++;
  bgStopRequest = null;
  layerGroup?.clearLayers();
  nearbyLayerGroup?.clearLayers();
  toggleTable();
  $("#stationName").hide();
  $("#lastUpdated").hide();
  $("#busRouteInfo").hide();
  $(
    "#scheduleSection, #error, #noBusesMessage, #tableContainer, #busRouteInfo, #updateInProgress",
  ).hide();
};

const searchByCoords = async (
  searchCoords,
  maxDistanceElemID,
  optionsElemID,
) => {
  $("#searchLoading").show();
  const stationsMaxDistance = $(maxDistanceElemID).val();
  const closestStations = await findClosestStations(
    searchCoords,
    allStations[getCity()] || [],
    stationsMaxDistance,
  );
  cancelInterval();
  const targetMap = nearbyMap || map;
  const targetLayer = nearbyLayerGroup || layerGroup;
  targetLayer.clearLayers();

  let markers = [];
  markers.push(
    createMarker([searchCoords.latitude, searchCoords.longitude], "", "green"),
  );
  const options = closestStations.map((station) => {
    const marker = createMarker(
      station.station.coords,
      station.station.id,
      "yellow",
    );
    marker.on("click", () => {
      $(optionsElemID).val(station.station.uid);
      submitByCoords();
    });
    markers.push(marker);
    const option = document.createElement("option");
    option.value = station.station.uid;
    option.textContent = `${station.station.name} (${station.station.id}) | ${station.distance}m`;
    return option;
  });
  $(optionsElemID).empty().append(options).trigger("change");

  const group = new L.featureGroup(markers).addTo(targetLayer);
  targetMap.fitBounds(group.getBounds());
  $("#searchLoading").hide();
};

const searchByGPS = async () => {
  $("#searchError").hide();
  $("#searchLoading").text("Finding nearby stations…").show();
  try {
    lastUserLocation = await getUserLocation();
    $("#nearbyMap").show();
    initNearbyMap();
    await searchByCoords(
      lastUserLocation,
      "#stationsMaxDistance-input",
      "#coords-input",
    );
    nearbyMap?.invalidateSize?.();
  } catch (error) {
    $("#searchError").text(`Unable to find nearby stations: ${error}`).show();
    $("#searchLoading").hide();
  }
};

const submitHandlers = {
  name: submitByName,
  coords: submitByCoords,
};

const setTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // The theme still applies for this page when storage is blocked.
  }
  const button = document.getElementById("themeToggle");
  if (button) {
    const icon = button.querySelector("span");
    if (icon) icon.textContent = theme === "dark" ? "☾" : "☼";
    button.setAttribute("aria-pressed", String(theme === "dark"));
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "dark" ? "#171a18" : "#ffffff";
};

$(document).ready(async () => {
  // Restore saved distance from localStorage
  let savedDistance;
  try {
    savedDistance = localStorage.getItem("stationsMaxDistance");
  } catch {
    // Nearby search keeps its default range when storage is blocked.
  }
  if (savedDistance) {
    document.getElementById("stationsMaxDistance-input").value = savedDistance;
    document.getElementById("stationsMaxDistance-label").textContent =
      `Maximum distance (${savedDistance}m)`;
  }

  // Custom name-search dropdown
  const input = document.getElementById("name-input");
  const dropdown = document.getElementById("dropdown");
  let stations = [];
  let activeIndex = -1;
  input.setAttribute("aria-expanded", "false");
  let noResults = document.getElementById("dropdown-status");
  if (!noResults) {
    noResults = document.createElement("p");
    noResults.id = "dropdown-status";
    noResults.className = "helper-text";
    noResults.setAttribute("role", "status");
    noResults.setAttribute("aria-live", "polite");
    noResults.hidden = true;
    dropdown.insertAdjacentElement("afterend", noResults);
  }

  const closeDropdown = () => {
    dropdown.style.display = "none";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    noResults.hidden = true;
    activeIndex = -1;
  };
  const setActiveOption = (index) => {
    const options = [...dropdown.querySelectorAll('[role="option"]')];
    activeIndex = Math.max(0, Math.min(options.length - 1, index));
    options.forEach((option, optionIndex) => {
      option.setAttribute("aria-selected", String(optionIndex === activeIndex));
    });
    input.setAttribute("aria-activedescendant", options[activeIndex].id);
  };
  const fetchStations = async () => {
    const city = getCity();
    if (!allStations[city]) await fetchCityStations(city);
    stations = (allStations[city] || [])
      .map((station) => ({
        name: station.name,
        id: station.id,
        uid: station.uid,
      }))
      .sort(
        (a, b) =>
          a.name
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .localeCompare(
              b.name.normalize("NFD").replace(/\p{M}/gu, ""),
              undefined,
              { sensitivity: "base" },
            ) ||
          String(a.id).localeCompare(String(b.id), undefined, {
            numeric: true,
          }),
      );
  };

  function showDropdown(stationList) {
    dropdown.replaceChildren();
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    if (stationList.length === 0) {
      closeDropdown();
      noResults.textContent = "No stations found.";
      noResults.hidden = false;
      return;
    }
    noResults.textContent = "";
    noResults.hidden = true;

    stationList.forEach((station, index) => {
      const item = document.createElement("div");
      item.id = `station-option-${index}`;
      item.classList.add("station-item");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.tabIndex = -1;
      item.textContent =
        getCity() === "bg" ? station.name : `${station.name} (${station.id})`;
      const selectStation = () => {
        input.value = station.name;
        closeDropdown();
        submitByName();
      };
      item.addEventListener("click", selectStation);
      dropdown.appendChild(item);
    });

    dropdown.style.display = "block";
    input.setAttribute("aria-expanded", "true");
    dropdown.style.position = "absolute";
    dropdown.style.left = "0";
    dropdown.style.top = `${input.offsetHeight + 2}px`;
  }

  input.addEventListener("focus", async () => {
    await fetchStations();
    showDropdown(stations);
  });

  input.addEventListener("input", () => {
    const value = input.value.toLowerCase();
    const filteredStations = stations.filter(
      (station) =>
        station.name.toLowerCase().includes(value) ||
        String(station.id).toLowerCase().includes(value),
    );
    showDropdown(filteredStations);
  });

  input.addEventListener("keydown", (event) => {
    const options = dropdown.querySelectorAll('[role="option"]');
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveOption(
        activeIndex < 0
          ? direction === 1
            ? 0
            : options.length - 1
          : activeIndex + direction,
      );
    } else if (
      event.key === "Enter" &&
      activeIndex >= 0 &&
      options[activeIndex]
    ) {
      event.preventDefault();
      options[activeIndex].click();
    } else if (event.key === "Escape" && dropdown.style.display !== "none") {
      event.preventDefault();
      closeDropdown();
    }
  });

  $(document).on("click", (event) => {
    if (!$(event.target).closest("#name-input, #dropdown").length) {
      closeDropdown();
    }
  });

  // Map & tab visibility handlers
  initMap();

  const themeButton = document.getElementById("themeToggle");
  if (themeButton) {
    const currentTheme =
      document.documentElement.dataset.theme ||
      (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light");
    const themeIcon = themeButton.querySelector("span");
    if (themeIcon) themeIcon.textContent = currentTheme === "dark" ? "☾" : "☼";
    themeButton.setAttribute("aria-pressed", String(currentTheme === "dark"));
    themeButton.addEventListener("click", () =>
      setTheme(
        (document.documentElement.dataset.theme || currentTheme) === "dark"
          ? "light"
          : "dark",
      ),
    );
  }

  const dialog = document.getElementById("arrivalsDialog");
  document.getElementById("closeArrivals")?.addEventListener("click", () => {
    closeArrivalsDialog();
  });
  dialog?.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    cancelInterval();
    bgVehicleRequestId++;
    bgRouteSelection = undefined;
  });
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeArrivalsDialog();
  });
  document.getElementById("findNearby")?.addEventListener("click", searchByGPS);
  // Load cities
  const response = await doAsyncRequest("/api/cities");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a city…";
  placeholder.selected = true;
  const cities = Object.entries(response).map(([key, value]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = value;
    return option;
  });
  $("#city")
    .empty()
    .append([placeholder, ...cities]);
  onCityChange();
  onSearchModeChange();

  $("#myForm").submit((event) => {
    event.preventDefault();
    submitHandlers[getSearchMode()]?.();
  });

  $("#noBusesMessage").hide();
  $("#tableContainer").hide();
});
