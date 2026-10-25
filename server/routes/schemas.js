const apikeys = require("../config");

const cityParams = {
  type: "object",
  required: ["city"],
  properties: {
    city: {
      type: "string",
      enum: Object.keys(apikeys),
    },
  },
  additionalProperties: false,
};

const stationSearchQuery = {
  type: "object",
  properties: {
    uid: {
      type: "string",
      minLength: 1,
    },
    id: {
      type: "string",
      minLength: 1,
    },
  },
  additionalProperties: false,
  anyOf: [{ required: ["uid"] }, { required: ["id"] }],
};

const stationScheduleQuery = {
  type: "object",
  required: ["uid"],
  properties: {
    uid: {
      type: "string",
      minLength: 1,
    },
    date: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
  },
  additionalProperties: false,
};

const routeQuery = {
  type: "object",
  required: ["coords"],
  properties: {
    coords: {
      type: "string",
      minLength: 7,
      maxLength: 2000,
      pattern:
        "^-?\\d+(?:\\.\\d+)?,-?\\d+(?:\\.\\d+)?(?:;-?\\d+(?:\\.\\d+)?,-?\\d+(?:\\.\\d+)?)*$",
    },
  },
  additionalProperties: false,
};

const bgRouteParams = {
  type: "object",
  required: ["lineId", "threadId"],
  additionalProperties: false,
  properties: {
    lineId: { type: "string", pattern: "^[0-9]{1,20}$" },
    threadId: { type: "string", pattern: "^[0-9]{1,20}$" },
  },
};

module.exports = {
  bgRouteParams,
  cityParams,
  routeQuery,
  stationScheduleQuery,
  stationSearchQuery,
};
