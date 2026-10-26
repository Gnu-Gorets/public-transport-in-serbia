let currInterval;
let map, layerGroup;
let currQuery;
let allStations = {};
let allLines = {};
let mapInitialized = false;
let currentPolyline = null;
let scheduleLoadedUid = null;
let currentCity;
let bgStopCentered = false;
let bgStopRequest;
let bgStopId;
let bgStopMarker;
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
  if (popupText)
    marker.bindPopup(popupText, { autoClose: false, closeOnClick: false });
  if (name)
    marker.bindTooltip(name, {
      permanent: true,
      direction: "center",
      className: "my-labels",
    });
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

    $("#error").html(`Error updating data: ${errorMessage}`);
    $("#error").show();

    if (errorHandler) {
      errorHandler(error);
    }
  }
};

const fetchCityStations = async (city) => {
  let response = await doAsyncRequest(`/api/stations/${city}/all`);
  allStations[city] = response;
};

const fetchCityLines = async (city) => {
  const response = await doAsyncRequest(`/api/lines/${city}`);
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
  return encodeURIComponent($("#city").val());
};

const onCityChange = async () => {
  const city = getCity();
  const isBelgrade = city === "bg";
  const wasBelgrade = currentCity === "bg";
  currentCity = city;
  changeBg(city);
  $("#stationControls").toggle(true);
  $("#searchMode option[value=coords]").prop("hidden", isBelgrade).prop("disabled", isBelgrade);
  $("#map").show();
  $("#updateInProgress, #stationName, #lastUpdated, #busRouteInfo, #error, #noBusesMessage, #tableContainer, #scheduleSection").hide();

  if (isBelgrade || wasBelgrade) {
    currInterval = clearInterval(currInterval);
    currQuery = undefined;
    bgVehicleRequestId++;
    bgVehicleLayer = undefined;
    bgStopMarker = undefined;
    bgStopId = undefined;
  }
  if (isBelgrade) {
    $("#searchMode").val("name");
    onSearchModeChange();
    scheduleLoadedUid = null;
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
  $("#noBusesMessage").text("Currently, there are no buses scheduled to arrive at this stop.");
  moveMapToCityCentre(city);
  const promises = [];
  if (!allStations[city]) promises.push(fetchCityStations(city));
  if (!allLines[city]) promises.push(fetchCityLines(city));
  await Promise.all(promises);
};

const onSearchModeChange = () => {
  let searchMode = $("#searchMode").val();
  if (searchMode == "name") {
    $(`#submit`).hide();
  } else {
    $(`#submit`).show();
  }
  if (searchMode == "coords") searchByGPS();
  $("#searchMode option")
    .toArray()
    .forEach((option) => {
      let value = $(option).val();
      if (value === searchMode) $(`.${value}-search`).show();
      else $(`.${value}-search`).hide();
    });
};

const formatSeconds = (seconds) => {
  let minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
};

const handleTabOut = () => {
  currInterval = clearInterval(currInterval);
};

const handleTabIn = () => {
  if (getCity() === "bg") {
    if (currQuery && !currInterval) {
      fetchBgStop();
      currInterval = setInterval(fetchBgStop, 60 * 1000);
    }
    return;
  }
  spawnInterval();
};

const updateArrivals = (response, recenter) => {
  let date = new Date();

  let name = `${response.name} (${response.id})`;
  $("#stationName").html(`Station: ${name}`);
  $("#lastUpdated").html(
    `Last updated: ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Belgrade" })} (auto refresh - 30 seconds)`,
  );
  $("#stationName").show();
  $("#lastUpdated").show();
  $("#updateInProgress").hide();

  layerGroup.clearLayers();
  if (recenter) map.setView(response.coords, 13, { animation: true });

  let markers = [];
  markers.push(createMarker(response.coords, "", "yellow", name));

  if (response.vehicles.length === 0) {
    $("#busRouteInfo").hide();
    $("#tableContainer").hide();
    $("#noBusesMessage").show();
    return;
  }

  $("#noBusesMessage").hide();
  $("#tableContainer").show();
  const city = getCity();
  const uid = response.uid;
  $("#busRouteInfo")
    .html(
      `Click on bus number to view its route on map. &nbsp;|&nbsp; <a id="scheduleToggle" href="#" style="color:#1abc9c" onclick="event.preventDefault();toggleSchedule('${city}','${uid}')">View schedule</a>`,
    )
    .show();

  response.vehicles.sort((a, b) => {
    const [aNum, aLetter] = a.lineNumber.match(/^(\d+)(\D*)/).slice(1);
    const [bNum, bLetter] = b.lineNumber.match(/^(\d+)(\D*)/).slice(1);
    if (aNum !== bNum) {
      return parseInt(aNum) - parseInt(bNum);
    }
    if (aLetter !== bLetter) {
      return aLetter.localeCompare(bLetter);
    }
    return a.secondsLeft - b.secondsLeft;
  });

  const tableData = response.vehicles
    .map((value) => {
      let marker = createMarker(
        value.coords,
        value.lineNumber,
        "blue",
        value.main_line_title,
      );
      marker.on("click", () =>
        handleBusClick(value.lineNumber, value.allStations),
      );
      markers.push(marker);
      const formattedTime = formatSeconds(value.secondsLeft);
      const stationsJson = JSON.stringify(value.allStations)
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

      return `<tr onclick="handleBusClick('${value.lineNumber}', ${stationsJson})">
                      <td><a href="#" style="color: #FFD700;" onclick="event.preventDefault();">${value.lineNumber}</a></td>
                      <td>${formattedTime === "0 min" ? "At stop (< 1 min)" : formattedTime}</td>
                      <td>${value.main_line_title}</td>
                  </tr>`;
    })
    .join("");
  $("#tableBody").html(tableData);
  $("#tabela").show();
  let group = L.featureGroup(markers).addTo(layerGroup);
  if (recenter) map.fitBounds(group.getBounds());
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
    .filter((arrival) => Number.isFinite(arrival.timestamp) && arrival.timestamp >= now - 60_000)
    .sort((a, b) => a.timestamp - b.timestamp);

  $("#stationName").text(`Station: ${response.name}`).show();
  $("#lastUpdated").text(
    `Last updated: ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Belgrade" })} (Yandex page; refresh every 60 seconds)`,
  ).show();
  $("#busRouteInfo").text("Live bus positions are shown when available. Select line to view route.").show();
  $("#updateInProgress").hide();
  $("#error").hide();
  $("#tableBody").empty();
  layerGroup.clearLayers();
  bgVehicleLayer = undefined;

  const recenter = !bgStopCentered;
  if (recenter) {
    map.setView(response.coords, 15, { animation: true });
    bgStopCentered = true;
  }
  const popup = document.createElement("span");
  popup.textContent = response.name;
  bgStopMarker = createMarker(response.coords, undefined, "yellow", popup);
  L.featureGroup([bgStopMarker]).addTo(layerGroup);
  if (bgRouteData) drawBgRoute(bgRouteData, false);

  if (!arrivals.length) {
    $("#tableContainer").hide();
    $("#noBusesMessage").text("No live arrival estimates are available for this stop.").show();
    drawBgVehicles([]);
    return;
  }

  $("#noBusesMessage").hide();
  $("#tableContainer").show();
  $("#tabela").show();
  const rows = arrivals.map((arrival) => {
    const row = document.createElement("tr");
    const arrivalTime = new Date(arrival.timestamp).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Belgrade",
    });
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
        button.setAttribute("aria-label", `View route ${value} to ${arrival.destination || "destination"}`);
        cell.appendChild(button);
      } else cell.textContent = value;
      row.appendChild(cell);
    });
    return row;
  });
  $("#tableBody").append(rows);
  if (currQuery) return refreshBgVehicles(recenter);
};

const drawBgVehicles = (vehicles = [], recenter = false) => {
  if (bgVehicleLayer) layerGroup.removeLayer(bgVehicleLayer);
  bgVehicleLayer = undefined;
  const markers = vehicles
    .filter((vehicle) => Array.isArray(vehicle.coords) && vehicle.coords.length === 2 && vehicle.coords.every(Number.isFinite))
    .map((vehicle) => createMarker(vehicle.coords, vehicle.lineNumber, "blue", `Bus ${vehicle.lineNumber}`));
  if (!markers.length) return;
  bgVehicleLayer = L.featureGroup(markers).addTo(layerGroup);
  if (recenter && bgStopMarker) map.fitBounds(L.featureGroup([bgStopMarker, ...markers]).getBounds());
};

const refreshBgVehicles = async (recenter = false) => {
  const requestId = ++bgVehicleRequestId;
  const query = currQuery;
  const clearLatest = () => {
    if (getCity() === "bg" && currQuery === query && requestId === bgVehicleRequestId) drawBgVehicles([]);
  };
  const response = await doAsyncRequest(`/api/bg/poc/vehicles?stopId=${encodeURIComponent(query.uid || bgStopId)}`, "GET", undefined, clearLatest);
  if (getCity() !== "bg" || currQuery !== query || requestId !== bgVehicleRequestId) return;
  drawBgVehicles(Array.isArray(response?.vehicles) ? response.vehicles : [], recenter);
};

const drawBgRoute = (route, recenter = true) => {
  if (currentPolyline) layerGroup.removeLayer(currentPolyline);
  currentPolyline = L.polyline(route.segments, { color: "blue" }).addTo(layerGroup);
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
  const response = await doAsyncRequest(`/api/bg/poc/routes/${encodeURIComponent(route.lineId)}/${encodeURIComponent(route.threadId)}?stopId=${encodeURIComponent(query?.uid || bgStopId)}`);
  if (getCity() !== "bg" || currQuery !== query || bgRouteSelection !== selection || !response) return;
  bgRouteData = response;
  drawBgRoute(response);
};

const fetchBgStop = () => {
  if (getCity() !== "bg") return Promise.resolve();
  if (bgStopRequest) return bgStopRequest;
  bgStopRequest = (async () => {
    if (currQuery) $("#updateInProgress").show();
    $("#error").hide();
    const stopId = currQuery?.uid;
    if (!stopId) return;
    const response = await doAsyncRequest(`/api/bg/poc/stop?stopId=${encodeURIComponent(stopId)}`);
    if (!response || getCity() !== "bg") {
      $("#updateInProgress").hide();
      return;
    }
    if (currQuery?.uid !== response.uid) {
      $("#updateInProgress").hide();
      return;
    }
    await updateBgArrivals(response);
  })().finally(() => { bgStopRequest = null; });
  return bgStopRequest;
};

const fetchArrivals = async (city, query, recenter) => {
  let url = `/api/stations/${city}/search?${$.param(query)}`;
  $("#updateInProgress").show();
  $("#error").hide();

  let response = await doAsyncRequest(url, "GET", undefined, (error) => {
    console.error("Error sending request:", error);
    $("#updateInProgress").hide();
    $("#error").html(
      `Error updating data: ${error?.responseJSON?.message || "Invalid response"}`,
    );
    $("#error").show();
  });

  // Проверяем, что response определён
  if (!response) {
    $("#updateInProgress").hide();
    return;
  }

  updateArrivals(response, recenter);
};

const spawnInterval = (query = undefined) => {
  if (!query) query = currQuery;
  if (!query) return;

  let city = getCity();
  fetchArrivals(city, query, true);

  currInterval = clearInterval(currInterval);
  currInterval = setInterval(() => {
    fetchArrivals(city, query, false);
  }, 30 * 1000);
};

const handleBusClick = (busNumber, fallbackStations) => {
  addRouteToMap(busNumber, fallbackStations);
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
  if (!force && scheduleLoadedUid === uid) {
    $("#scheduleSection").show();
    return;
  }
  $("#scheduleSection").hide();
  $("#scheduleInfo").html("Loading schedule...");
  $("#scheduleSection").show();
  $("#scheduleContainer").html("");

  const response = await doAsyncRequest(
    `/api/stations/${city}/schedule?uid=${encodeURIComponent(uid)}`,
  );
  if (!response?.schedule) {
    $("#scheduleInfo").html("Failed to load schedule.");
    return;
  }

  const lines = Object.keys(response.schedule);
  if (!lines.length) {
    $("#scheduleInfo").html("No upcoming departures today.");
    return;
  }

  const parts = response.date.split(/[-/]/);
  const formattedDate =
    parts.length === 3 && parts[0].length === 4
      ? `${parseInt(parts[2])}/${parseInt(parts[1])}/${parts[0]}`
      : response.date;
  $("#scheduleInfo").html(`Schedule for ${formattedDate}:`);

  const makeChip = (t) => {
    const isNextDay = t.includes("(+24h)");
    const clean = t.replace("(+24h)", "").trim();
    return `<span style="display:inline-block;background:rgba(255,255,255,0.12);padding:2px 6px;border-radius:4px;margin:1px;white-space:nowrap;font-size:0.82rem;${isNextDay ? "opacity:0.55" : ""}">${clean}${isNextDay ? "*" : ""}</span>`;
  };

  const tableRows = lines
    .map((line) => {
      const allChips = response.schedule[line].map(makeChip).join("");
      return `<tr>
        <td style="position:sticky;left:0;background:#1a1f2e;white-space:nowrap;color:#FFD700;font-size:0.85rem;font-weight:700;padding:3px 10px 3px 0;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,0.05)">${line}</td>
        <td style="white-space:nowrap;padding:3px 0 5px;border-bottom:1px solid rgba(255,255,255,0.05)">${allChips}</td>
      </tr>`;
    })
    .join("");

  $("#scheduleContainer").html(`
    <div style="overflow-x:auto;margin-top:8px">
      <table style="color:white;font-size:0.9rem;border-collapse:collapse;width:100%">
        <thead><tr>
          <th style="position:sticky;left:0;background:#1a1f2e;color:#1abc9c;font-size:0.72rem;font-weight:700;letter-spacing:.06em;text-align:left;padding-bottom:4px;border-bottom:1px solid #333">#</th>
          <th style="color:#1abc9c;font-size:0.72rem;font-weight:700;letter-spacing:.06em;text-align:left;padding-bottom:4px;border-bottom:1px solid #333">DEPARTURES</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `);
  scheduleLoadedUid = uid;
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

  if (!latlngs && cityLines && cityStations) {
    const stationMap = {};
    cityStations.forEach((s) => {
      stationMap[String(s.uid)] = s.coords;
    });

    for (const dir of ["A", "B"]) {
      const uids = cityLines[`${lineNumber}_${dir}`];
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
      return;
    }
  } catch (_) {
    /* fall through */
  }

  currentPolyline = L.polyline(latlngs, { color: "blue" }).addTo(layerGroup);
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

const submitByName = () => {
  if (!$("#name-input").val()) return;
  const selectedValue = $("#name-input").val().trim();
  const city = getCity();
  const station = (allStations[city] || []).find(
    (s) => s.name === selectedValue || s.id === selectedValue,
  );
  if (city === "bg" && !station) return;
  currQuery = { uid: station?.uid || selectedValue };
  if (city === "bg") {
    currInterval = clearInterval(currInterval);
    const refresh = fetchBgStop();
    currInterval = setInterval(fetchBgStop, 60 * 1000);
    return refresh;
  }
  spawnInterval(currQuery);
};

const submitByCoords = () => {
  let uid = encodeURIComponent($("#coords-input").val().trim());
  currQuery = { uid: uid };
  spawnInterval(currQuery);
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
  let rangeInput = document.getElementById("stationsMaxDistance-input");
  let rangeValue = rangeInput.value;
  document.getElementById("stationsMaxDistance-label").textContent =
    `Distance (${rangeValue}m):`;
  localStorage.setItem("stationsMaxDistance", rangeValue);
  searchByGPS();
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
          $("#error").html("Error retrieving location.");
          $("#error").show();
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
  scheduleLoadedUid = null;
  layerGroup.clearLayers();
  toggleTable();
  $("#stationName").hide();
  $("#lastUpdated").hide();
  $("#busRouteInfo").hide();
  $("#scheduleSection").hide();
};

const searchByCoords = async (
  searchCoords,
  maxDistanceElemID,
  optionsElemID,
) => {
  $("#updateInProgress").show();
  const stationsMaxDistance = $(maxDistanceElemID).val();
  const closestStations = await findClosestStations(
    searchCoords,
    allStations[getCity()],
    stationsMaxDistance,
  );
  layerGroup.clearLayers();
  cancelInterval();

  let markers = [];
  markers.push(
    createMarker([searchCoords.latitude, searchCoords.longitude], "", "green"),
  );
  let options = closestStations.map((station) => {
    let marker = createMarker(
      station.station.coords,
      station.station.id,
      "yellow",
    );
    marker.on("click", () => {
      $(optionsElemID).val(station.station.uid).trigger("change");
    });
    markers.push(marker);

    return `<option value="${station.station.uid}">${station.station.name} (${station.station.id}) | ${station.distance}m</option>`;
  });
  $(optionsElemID).html(options).trigger("change");

  let group = new L.featureGroup(markers).addTo(layerGroup);
  map.fitBounds(group.getBounds());
  $("#updateInProgress").hide();
};

const searchByGPS = async () => {
  $("#error").hide();
  const userLocation = await getUserLocation();
  await searchByCoords(
    userLocation,
    "#stationsMaxDistance-input",
    "#coords-input",
  );
  if ($("#coords-input").val()) {
    currQuery = { uid: $("#coords-input").val().trim() };
    toggleTable();
  }
};

const submitHandlers = {
  name: submitByName,
  coords: submitByCoords,
};

$(document).ready(async () => {
  // Restore saved distance from localStorage
  const savedDistance = localStorage.getItem("stationsMaxDistance");
  if (savedDistance) {
    document.getElementById("stationsMaxDistance-input").value = savedDistance;
    document.getElementById("stationsMaxDistance-label").textContent =
      `Distance (${savedDistance}m):`;
  }

  // Custom name-search dropdown
  const input = document.getElementById("name-input");
  const dropdown = document.getElementById("dropdown");
  let stations = [];
  const fetchStations = async () => {
    const city = getCity();
    if (!allStations[city]) {
      if (city === "bg") {
        const response = await doAsyncRequest("/api/bg/stops");
        allStations.bg = (response?.stops || []).map((stop) => ({ ...stop, uid: stop.id }));
      } else await fetchCityStations(city);
    }
    stations = (allStations[city] || []).map((station) => ({
      name: station.name,
      id: station.id,
      uid: station.uid,
    }));
  };

  function showDropdown(stationList) {
    dropdown.innerHTML = "";
    if (stationList.length === 0) {
      dropdown.style.display = "none";
      return;
    }

    stationList.forEach((station) => {
      const item = document.createElement("div");
      item.classList.add("station-item");
      item.textContent = getCity() === "bg" ? station.name : `${station.name} (${station.id})`;
      item.addEventListener("click", () => {
        input.value = station.name;
        dropdown.style.display = "none";
        submitByName();
      });
      dropdown.appendChild(item);
    });

    dropdown.style.display = "block";
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
        station.id.includes(value),
    );
    showDropdown(filteredStations);
  });

  $(document).on("click", (event) => {
    if (!$(event.target).closest("#name-input, #dropdown").length) {
      dropdown.style.display = "none";
    }
  });

  // Map & tab visibility handlers
  $(window).on("blur", handleTabOut);
  $(window).on("focus", handleTabIn);
  initMap();

  // Load cities
  const response = await doAsyncRequest("/api/cities");
  const cities = Object.entries(response).map(
    ([key, value]) => `<option value="${key}">${value}</option>`,
  );
  $("#city").html(cities);
  onCityChange();
  onSearchModeChange();

  $("#myForm").submit((event) => {
    event.preventDefault();
    submitHandlers[getSearchMode()]();
  });

  $("#noBusesMessage").hide();
  $("#tableContainer").hide();
});
