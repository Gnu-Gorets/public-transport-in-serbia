let idUidMap = {};
let allStations = {};
let allLines = {};

const resetState = () => {
  idUidMap = {};
  allStations = {};
  allLines = {};
};

const setState = (nextState = {}) => {
  idUidMap = nextState.id_uid_map || {};
  allStations = nextState.allStations || {};
  allLines = nextState.allLines || {};
};

const getIdUidMap = () => idUidMap;
const getAllStations = () => allStations;
const getAllLines = () => allLines;

module.exports = {
  resetState,
  setState,
  getIdUidMap,
  getAllStations,
  getAllLines,
};
