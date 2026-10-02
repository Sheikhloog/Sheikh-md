const config = {
  botName: process.env.BOT_NAME || "SHEIKH-MD",
  ownerName: process.env.OWNER_NAME || "Sheikh",
  ownerNumber: (process.env.OWNER_NUMBER || "").replace(/\D/g, ""),
  prefix: process.env.PREFIX || ".",
  sessionName: process.env.SESSION_NAME || "sheikh-md",
  connectionMethod: (process.env.CONNECTION_METHOD || "both").toLowerCase(),
  pairingNumber: (process.env.PAIRING_NUMBER || "").replace(/\D/g, ""),
  aiApiUrl: process.env.AI_API_URL || "",
  aiApiKey: process.env.AI_API_KEY || "",
  botMode: process.env.BOT_MODE || "public",
  logLevel: process.env.LOG_LEVEL || "info"
};

module.exports = config;