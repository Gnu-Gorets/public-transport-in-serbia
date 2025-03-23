let currInterval;
let map, layerGroup;
let currQuery;
let allStations = {};
let mapInitialized = false;
let lastClickedBus = null;
let currentPolyline = null;

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
  popupText = undefined
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

const addMarker = (coords, name = undefined, color = "blue") => {
  createMarker(coords, name, color).addTo(layerGroup);
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

    console.error(`Request failed! URL: ${url}, Status: ${error.status}, Response:`, error.responseText);

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
  fillNameSearch(city);
};

const moveMapToCityCentre = (city) => {
  const cityCentres = {
    bg: [44.81254796404323, 20.46145496621977],
    ns: [45.267136, 19.833549],
    nis: [43.3209, 21.8958],
  };

  if (!currInterval) map.setView(cityCentres[city], 13, { animation: true });
};

const fillNameSearch = (city) => {
  let stations = allStations[city];
  let emptyOption = `<option value="" selected disabled>Select or Input Station here</option>`;
  let names = stations.map((station) => {
    return `<option value="${station.uid}">${station.name} (${station.id})</option>`;
  });
  document.getElementById("name-input").innerHTML = emptyOption + names.join("");
};

const getSearchMode = () => {
  return $("#searchMode").val();
};

const getCity = () => {
  return encodeURIComponent($("#city").val());
};

const onCityChange = async () => {
  let city = getCity();
  changeBg(city);
  moveMapToCityCentre(city);
  if (!allStations[city]) await fetchCityStations(city);
  else fillNameSearch(city);
};

const onSearchModeChange = () => {
  let searchMode = $("#searchMode").val();
  if (searchMode == "name") { $(`#submit`).hide() } else { $(`#submit`).show() };
  if (searchMode == "coords") searchByGPS();
  $("#searchMode option")
    .toArray()
    .map((option) => {
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
  clearInterval(currInterval);
};

const handleTabIn = () => {
  spawnInterval();
};

const updateArrivals = (response, recenter) => {
  let date = new Date();

  let name = `${response.name} (${response.id})`;
  $("#stationName").html(`Station: ${name}`);
  $("#lastUpdated").html(
    `Last updated: ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (auto refresh - 30 seconds)`
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
  $("#busRouteInfo").html(`Click on bus number to view its route on map.`).show();

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
      let marker = createMarker(value.coords, value.lineNumber, "blue", value.main_line_title);
      marker.on("click", () => handleBusClick(value.lineNumber, value.allStations));
      markers.push(marker);
      const formattedTime = formatSeconds(value.secondsLeft);
      const stationsJson = JSON.stringify(value.allStations)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

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

const fetchArrivals = async (city, query, recenter) => {
  let url = `/api/stations/${city}/search?${$.param(query)}`;
  $("#updateInProgress").show();
  $("#error").hide();

  let response = await doAsyncRequest(url, "GET", undefined, (error) => {
    console.error("Error sending request:", error);
    $("#updateInProgress").hide();
    $("#error").html(
      `Error updating data: ${error?.responseJSON?.message || "Invalid response"}`
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

const handleBusClick = (busNumber, stations) => {
  lastClickedBus = busNumber;
  addRouteToMap(stations);
};

const addRouteToMap = (stations) => {
  if (currentPolyline) {
    layerGroup.removeLayer(currentPolyline);
  }

  const latlngs = stations.map(station => [parseFloat(station.latitude), parseFloat(station.longitude)]);
  currentPolyline = L.polyline(latlngs, { color: 'blue' }).addTo(layerGroup);
  map.addLayer(currentPolyline);
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
  let selectedValue = $("#name-input").val().trim();
  let city = getCity();
  let station = allStations[city].find(s => s.name === selectedValue || s.id === selectedValue);
  if (station) {
    currQuery = { uid: station.uid };
  } else {
    currQuery = { uid: selectedValue };
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
  document.getElementById("stationsMaxDistance-label").textContent = `Distance (${rangeValue}m):`;
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
        }
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
  maxDistance = 300
) => {
  const stationsWithDistances = stationsArray.map((station) => {
    const distance = getDistanceFromCoords(
      userLocation.latitude,
      userLocation.longitude,
      ...station.coords
    );
    return { station, distance };
  });

  let closestStations = stationsWithDistances.filter(
    (item) => item.distance <= maxDistance
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
  layerGroup.clearLayers();
  toggleTable();
  $("#stationName").hide();
  $("#lastUpdated").hide();
  $("#busRouteInfo").hide();
};

const searchByCoords = async (
  searchCoords,
  maxDistanceElemID,
  optionsElemID
) => {
  $("#updateInProgress").show();
  const stationsMaxDistance = $(maxDistanceElemID).val();
  const closestStations = await findClosestStations(
    searchCoords,
    allStations[getCity()],
    stationsMaxDistance
  );
  layerGroup.clearLayers();
  cancelInterval();

  markers = [];
  markers.push(
    createMarker([searchCoords.latitude, searchCoords.longitude], "", "green")
  );
  let options = closestStations.map((station) => {
    let marker = createMarker(
      station.station.coords,
      station.station.id,
      "yellow"
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
  await searchByCoords(userLocation, "#stationsMaxDistance-input", "#coords-input");
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
  $(window).on("blur", handleTabOut);
  $(window).on("focus", handleTabIn);

  if (!mapInitialized) {
    initMap();
  }
  $(".select2").select2({ width: "resolve" });

  let response = await doAsyncRequest("/api/cities");

  let cities = Object.entries(response).map(([key, value]) => {
    return `<option value="${key}">${value}</option>`;
  });
  $("#city").html(cities);
  onCityChange();
  onSearchModeChange();

  $("#myForm").submit((event) => {
    event.preventDefault(); // Prevent form from being submitted
    submitHandlers[getSearchMode()]();
  });

  // Initially hide the message and table
  if ($("#noBusesMessage").length > 0) {
    $("#noBusesMessage").after("<br />");
  }

  $("#noBusesMessage").hide();
  $("#tableContainer").hide();
});

document.addEventListener("DOMContentLoaded", () => {
  let savedDistance = localStorage.getItem("stationsMaxDistance");
  if (savedDistance) {
    let rangeInput = document.getElementById("stationsMaxDistance-input");
    let rangeLabel = document.getElementById("stationsMaxDistance-label");

    rangeInput.value = savedDistance;
    rangeLabel.textContent = `Distance (${savedDistance}m):`;
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const input = document.getElementById("name-input");
  const dropdown = document.getElementById("dropdown");
  let stations = [];

  const fetchStations = async () => {
    let city = getCity();
    if (!allStations[city]) await fetchCityStations(city);
    stations = allStations[city].map(station => ({
      name: station.name,
      id: station.id,
      uid: station.uid
    }));
  };

  input.addEventListener("focus", async () => {
    await fetchStations();
    showDropdown(stations);
  });

  input.addEventListener("input", () => {
    let value = input.value.toLowerCase();
    let filteredStations = stations.filter(station =>
      station.name.toLowerCase().includes(value) || station.id.includes(value)
    );
    showDropdown(filteredStations);
  });

  function showDropdown(stationList) {
    dropdown.innerHTML = "";
    if (stationList.length === 0) {
      dropdown.style.display = "none";
      return;
    }

    stationList.forEach(station => {
      let item = document.createElement("div");
      item.classList.add("dropdown-item");
      item.textContent = `${station.name} (${station.id})`;

      item.addEventListener("click", () => {
        input.value = station.name;
        dropdown.style.display = "none";
        submitByName(station.uid);
      });

      dropdown.appendChild(item);
    });

    dropdown.style.display = "block";
    dropdown.style.position = "absolute";
    dropdown.style.left = "0";
    dropdown.style.top = `${input.offsetHeight + 2}px`;
  }

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
});

$(document).ready(function () {
  const $dropdown = $("#dropdown");
  const $map = $("#map");
  let overlay = $("<div class='overlay'></div>").hide().appendTo("body");

  $("#name-input").on("focus", function () {
    $dropdown.show();
    overlay.show();
  });

  $(document).on("click", function (event) {
    if (!$(event.target).closest("#name-input, #dropdown").length) {
      $dropdown.hide();
      overlay.hide();
    }
  });
});
