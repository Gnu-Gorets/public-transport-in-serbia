const { state } = require("./state");

function transformAllStationsResponse(response) {
  return Object.fromEntries(
    response.stations.map((v) => [
      v.id,
      {
        name: v.name,
        uid: v.id,
        id: v.station_id,
        coords: [v.coordinates.latitude, v.coordinates.longitude],
        lines: v.lines_for_station || [],
      },
    ]),
  );
}

function transformAllLinesResponse(response) {
  return Object.fromEntries(
    (response.lines || []).map((line) => [
      `${line.line_number_for_display}_${line.direction_id_for_display}`,
      line.all_stations,
    ]),
  );
}

function transformStationResponse(response, city) {
  const uid = response[0].station_uid;
  const cachedStation = uid ? state.allStations[city]?.[uid] : null;
  return {
    city,
    name: response[0].station_name,
    uid,
    id: uid ? state.uidIdMap[city]?.[String(uid)] || "0" : "0",
    coords: cachedStation?.coords || [
      parseFloat(response[0].gpsy ?? 0),
      parseFloat(response[0].gpsx ?? 0),
    ],
    vehicles:
      response[0].just_coordinates == "1"
        ? []
        : response
            .filter((v) => {
              const lineNumber = v?.line_number;
              const secondsLeft = v?.seconds_left;
              return (
                (typeof lineNumber === "string" ||
                  typeof lineNumber === "number") &&
                String(lineNumber).trim() &&
                (typeof secondsLeft === "string" ||
                  typeof secondsLeft === "number") &&
                String(secondsLeft).trim() &&
                Number.isFinite(Number(secondsLeft))
              );
            })
            .map((v) => ({
              lineNumber: v.line_number,
              lineName: v.line_title,
              secondsLeft: v.seconds_left,
              stationsBetween: v.stations_between,
              main_line_title: v.main_line_title,
              stationName: v.vehicles?.[0]?.station_name,
              garageNo: v.vehicles?.[0]?.garageNo,
              coords: [v.vehicles?.[0]?.lat, v.vehicles?.[0]?.lng],
              allStations: (Array.isArray(v.all_stations) ? v.all_stations : [])
                .filter((s) => {
                  const latitude = s?.coordinates?.latitude;
                  const longitude = s?.coordinates?.longitude;
                  return (
                    latitude != null &&
                    longitude != null &&
                    String(latitude).trim() &&
                    String(longitude).trim() &&
                    Number.isFinite(Number(latitude)) &&
                    Number.isFinite(Number(longitude))
                  );
                })
                .map((s) => ({
                  latitude: Number(s.coordinates.latitude),
                  longitude: Number(s.coordinates.longitude),
                })),
            })),
  };
}

module.exports = {
  transformAllStationsResponse,
  transformAllLinesResponse,
  transformStationResponse,
};
