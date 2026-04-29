const base = require("./apikeys.json");

// Env vars override apikeys.json values.
// Useful for production deployments without committing credentials.
//
// Supported vars:
//   NS_KEY, NS_URL
//   BG_KEY, BG_URL, BG_V2_KEY, BG_V2_IV
//   NIS_KEY, NIS_URL

const apikeys = JSON.parse(JSON.stringify(base));

if (process.env.NS_KEY) apikeys.ns.key = process.env.NS_KEY;
if (process.env.NS_URL) apikeys.ns.url = process.env.NS_URL;

if (process.env.BG_KEY) apikeys.bg.key = process.env.BG_KEY;
if (process.env.BG_URL) apikeys.bg.url = process.env.BG_URL;
if (process.env.BG_V2_KEY) apikeys.bg.v2_key = process.env.BG_V2_KEY;
if (process.env.BG_V2_IV) apikeys.bg.v2_iv = process.env.BG_V2_IV;

if (process.env.NIS_KEY) apikeys.nis.key = process.env.NIS_KEY;
if (process.env.NIS_URL) apikeys.nis.url = process.env.NIS_URL;

module.exports = apikeys;
