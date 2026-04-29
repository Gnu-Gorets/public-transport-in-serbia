let idUidMap = {};
let uidIdMap = {};
let allStations = {};
let allLines = {};
let cacheMeta = {};

const resetState = () => {
  idUidMap = {};
  uidIdMap = {};
  allStations = {};
  allLines = {};
  cacheMeta = {};
};

const setState = (nextState = {}) => {
  idUidMap = nextState.id_uid_map || {};
  uidIdMap = nextState.uid_id_map || {};
  allStations = nextState.allStations || {};
  allLines = nextState.allLines || {};
  cacheMeta = nextState.cacheMeta || {};
};

const getIdUidMap = () => idUidMap;
const getUidIdMap = () => uidIdMap;
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
  getUidIdMap,
  getAllStations,
  getAllLines,
  getCacheMeta,
  markCacheError,
  markCacheLoaded,
};
