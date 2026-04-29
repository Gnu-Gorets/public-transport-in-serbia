let idUidMap = {};
let allStations = {};
let allLines = {};
let cacheMeta = {};

const resetState = () => {
  idUidMap = {};
  allStations = {};
  allLines = {};
  cacheMeta = {};
};

const setState = (nextState = {}) => {
  idUidMap = nextState.id_uid_map || {};
  allStations = nextState.allStations || {};
  allLines = nextState.allLines || {};
  cacheMeta = nextState.cacheMeta || {};
};

const getIdUidMap = () => idUidMap;
const getAllStations = () => allStations;
const getAllLines = () => allLines;
const getCacheMeta = () => cacheMeta;

const markCacheLoaded = (city, loadedAt) => {
  cacheMeta[city] = {
    loadedAt,
    lastError: null,
  };
};

const markCacheError = (city, err) => {
  cacheMeta[city] = {
    ...(cacheMeta[city] || {}),
    lastError: err.message || String(err),
  };
};

module.exports = {
  resetState,
  setState,
  getIdUidMap,
  getAllStations,
  getAllLines,
  getCacheMeta,
  markCacheError,
  markCacheLoaded,
};
