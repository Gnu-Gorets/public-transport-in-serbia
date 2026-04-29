const state = require("../state");
const { getLineTimetable, getAllStations } = require("./providerService");

const getBelgradeDate = () => {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Belgrade" }),
  );
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

async function getStationSchedule(city, uid, date) {
  const allStations = state.getAllStations();
  const scheduleDate = date || getBelgradeDate();

  if (!allStations[city]) await getAllStations(city);
  const station = allStations[city]?.[uid];
  if (!station) return null;

  const lines = station.lines || [];
  const schedule = {};
  const nowHHMM = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
  });

  await Promise.all(
    lines.flatMap((line) =>
      ["A", "B"].map(async (direction) => {
        try {
          const timetable = await getLineTimetable(
            city,
            line,
            direction,
            scheduleDate,
          );
          if (!Array.isArray(timetable)) return;
          const stationEntry = timetable.find(
            (s) => String(s.station_id) === String(uid),
          );
          if (!stationEntry?.departure_time?.length) return;

          const times = stationEntry.departure_time.filter((t) => {
            if (t.includes("(+24h)")) return true;
            return t.trim() >= nowHHMM;
          });
          if (!times.length) return;

          if (!schedule[line]) schedule[line] = new Set();
          times.forEach((t) => schedule[line].add(t));
        } catch (_) {
          /* skip */
        }
      }),
    ),
  );

  const result = {};
  for (const line of Object.keys(schedule).sort()) {
    result[line] = [...schedule[line]].sort((a, b) => {
      const aIs24 = a.includes("(+24h)");
      const bIs24 = b.includes("(+24h)");
      if (aIs24 !== bIs24) return aIs24 ? 1 : -1;
      return a
        .replace("(+24h)", "")
        .trim()
        .localeCompare(b.replace("(+24h)", "").trim());
    });
  }

  return {
    station: { uid: station.uid, name: station.name, id: station.id },
    schedule: result,
    date: scheduleDate,
  };
}

module.exports = {
  getStationSchedule,
};
