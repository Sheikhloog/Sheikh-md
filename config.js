const cleanNumber = (value = "") =>
  String(value).replace(/\D/g, "");

const config = {
  botName: process.env.BOT_NAME || "SHEIKH-MD",

  ownerName: process.env.OWNER_NAME || "Sheikh",

  ownerNumber: cleanNumber(
    process.env.OWNER_NUMBER || ""
  ),

  sudo: cleanNumber(
    process.env.SUDO || ""
  ),

  prefix: process.env.PREFIX || ".",

  sessionName:
    process.env.SESSION_NAME || "sheikh-md",

  sessionId:
    process.env.SESSION_ID || "",

  connectionMethod:
    (process.env.CONNECTION_METHOD || "both").toLowerCase(),

  pairingNumber: cleanNumber(
    process.env.PAIRING_NUMBER || ""
  ),

  aiApiUrl: process.env.AI_API_URL || "",

  aiApiKey: process.env.AI_API_KEY || "",

  botMode:
    process.env.BOT_MODE || "public",

  logLevel:
    process.env.LOG_LEVEL || "info"
};

module.exports = config;
