const state = {
  idUidMap: {},
  uidIdMap: {},
  allStations: {},
  allLines: {},
  cacheMeta: {},
};

const resetState = () => {
  Object.assign(state, { idUidMap: {}, uidIdMap: {}, allStations: {}, allLines: {}, cacheMeta: {} });
};

const setState = (next = {}) => {
  Object.assign(state, {
    idUidMap: next.id_uid_map || {},
    uidIdMap: next.uid_id_map || {},
    allStations: next.allStations || {},
    allLines: next.allLines || {},
    cacheMeta: next.cacheMeta || {},
  });
};

const markCacheLoaded = (city, loadedAt) => {
  state.cacheMeta[city] = { loadedAt, lastError: null };
};

const markCacheError = (city, err) => {
  state.cacheMeta[city] = {
    ...(state.cacheMeta[city] || {}),
    lastError: err.message || String(err),
  };
};

module.exports = { state, resetState, setState, markCacheLoaded, markCacheError };
