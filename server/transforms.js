const { state } = require("./state");

function transformAllStationsResponse(response) {
  let newResp = {};
  response.stations.forEach((value) => {
    let station = {};
    station.name = value.name;
    station.uid = value.id;
    station.id = value.station_id;
    station.coords = [value.coordinates.latitude, value.coordinates.longitude];
    station.lines = value.lines_for_station || [];
    newResp[station.uid] = station;
  });
  return newResp;
}

function transformAllLinesResponse(response) {
  const result = {};
  (response.lines || []).forEach((line) => {
    const key = `${line.line_number_for_display}_${line.direction_id_for_display}`;
    result[key] = line.all_stations;
  });
  return result;
}

function transformStationResponse(response, city) {
  let newResp = {};
  newResp.city = city;
  newResp.name = response[0].station_name;
  newResp.uid = response[0].station_uid;
  newResp.id = newResp.uid
    ? state.uidIdMap[city]?.[String(newResp.uid)] || "0"
    : "0";
  const cachedStation = newResp.uid ? state.allStations[city]?.[newResp.uid] : null;
  newResp.coords = cachedStation?.coords || [
    parseFloat(response[0].gpsy ?? 0),
    parseFloat(response[0].gpsx ?? 0),
  ];
  newResp.vehicles = [];

  if (response[0].just_coordinates == "1") return newResp;

  response.map((value) => {
    let vehicle = {};
    vehicle.lineNumber = value.line_number;
    vehicle.lineName = value.line_title;
    vehicle.secondsLeft = value.seconds_left;
    vehicle.stationsBetween = value.stations_between;
    vehicle.main_line_title = value.main_line_title;
    vehicle.stationName = value.vehicles?.[0]?.station_name;
    vehicle.garageNo = value.vehicles?.[0]?.garageNo;
    vehicle.coords = [value.vehicles?.[0]?.lat, value.vehicles?.[0]?.lng];
    vehicle.allStations = (value.all_stations || []).map((station) => ({
      latitude: station.coordinates.latitude,
      longitude: station.coordinates.longitude,
    }));
    newResp.vehicles.push(vehicle);
  });

  return newResp;
}

module.exports = {
  transformAllStationsResponse,
  transformAllLinesResponse,
  transformStationResponse,
};
