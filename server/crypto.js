const CryptoJS = require("crypto-js");

const decrypt = (input, b64key, b64iv) => {
  const key = CryptoJS.enc.Base64.parse(b64key);
  const iv = CryptoJS.enc.Base64.parse(b64iv);
  return CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.enc.Base64.parse(decodeURIComponent(input)) },
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  ).toString(CryptoJS.enc.Utf8);
};

const encrypt = (input, b64key, b64iv) => {
  const key = CryptoJS.enc.Base64.parse(b64key);
  const iv = CryptoJS.enc.Base64.parse(b64iv);
  return encodeURIComponent(
    CryptoJS.AES.encrypt(input, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 })
      .ciphertext.toString(CryptoJS.enc.Base64),
  );
};

module.exports = { decrypt, encrypt };
