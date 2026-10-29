const axios = require("axios");

let httpClient = axios;

const getHttpClient = () => httpClient;

const setHttpClient = (nextHttpClient) => {
  httpClient = nextHttpClient;
};

const resetHttpClient = () => {
  httpClient = axios;
};

module.exports = {
  getHttpClient,
  setHttpClient,
  resetHttpClient,
};
