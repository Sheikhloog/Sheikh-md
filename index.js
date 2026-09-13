/**
 * SHEIKH-MD WhatsApp Bot
 * QR + Pairing Code + Self Number Support
 * Session ID + SUDO Environment Support
 */

"use strict";

require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const qrcode = require("qrcode-terminal");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");

const config = require("./config");
const { handleMessage } = require("./lib/commandHandler");

// ======================================================
// HEALTH SERVER
// ======================================================

const PORT = Number(process.env.PORT || 3000);

const healthServer = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(
    JSON.stringify({
      status: "ok",
      bot: config.botName || "SHEIKH-MD",
      service: "SHEIKH-MD WhatsApp Bot",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    })
  );
});

healthServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// ======================================================
// SESSION CONFIGURATION
// ======================================================

const SESSION_NAME =
  process.env.SESSION_NAME ||
  config.sessionName ||
  "sheikh-md";

const SESSION_DIR = path.join(
  __dirname,
  "sessions",
  SESSION_NAME
);

// Session ID is received from environment.
// Actual serialized-session decoding will be added
// through the session importer in the next stage.
const SESSION_ID =
  String(process.env.SESSION_ID || "").trim();

const SUDO_NUMBER = String(
  process.env.SUDO ||
  config.sudo ||
  ""
).replace(/\D/g, "");

let isStarting = false;
let reconnectTimer = null;
let currentSocket = null;
let shuttingDown = false;

// ======================================================
// HELPERS
// ======================================================

function normalizePhoneNumber(number) {
  return String(number || "")
    .replace(/[^\d]/g, "")
    .replace(/^00/, "");
}

function isValidMessage(message) {
  if (!message?.message) {
    return false;
  }

  if (message.key?.remoteJid === "status@broadcast") {
    return false;
  }

  return true;
}

function getDisconnectCode(lastDisconnect) {
  try {
    return new Boom(lastDisconnect?.error)
      .output
      .statusCode;
  } catch {
    return 0;
  }
}

function printStartupInformation() {
  console.log("\n======================================");
  console.log("🚀 SHEIKH-MD STARTING");
  console.log("======================================");
  console.log(`🤖 Bot Name: ${config.botName || "SHEIKH-MD"}`);
  console.log(`👤 Owner: ${config.ownerName || "Not set"}`);
  console.log(`⚡ Prefix: ${config.prefix || "."}`);
  console.log(`🌍 Mode: ${config.botMode || "public"}`);
  console.log(`📁 Session: ${SESSION_NAME}`);
  console.log(
    `🔐 Session ID: ${SESSION_ID ? "Provided" : "Not provided"}`
  );
  console.log(
    `👑 SUDO: ${SUDO_NUMBER || "Not configured"}`
  );
  console.log(
    `🔌 Connection Method: ${
      config.connectionMethod || "both"
    }`
  );
  console.log("======================================\n");
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) {
    return;
  }

  console.log("🔄 Reconnecting in 5 seconds...");

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    startBot().catch((error) => {
      console.error(
        "❌ Reconnect error:",
        error?.stack || error?.message || error
      );
    });
  }, 5000);
}

// ======================================================
// START BOT
// ======================================================

async function startBot() {
  if (shuttingDown) {
    return;
  }

  if (isStarting) {
    console.log("⚠️ Bot startup already in progress...");
    return;
  }

  isStarting = true;

  // Pairing must only be requested once per socket.
  let pairingRequested = false;

  try {
    fs.mkdirSync(SESSION_DIR, {
      recursive: true
    });

    printStartupInformation();

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(SESSION_DIR);

    const {
      version
    } = await fetchLatestBaileysVersion();

    const logger = P({
      level: config.logLevel || "silent"
    });

    const sock = makeWASocket({
      version,

      logger,

      auth: {
        creds: state.creds,

        keys: makeCacheableSignalKeyStore(
          state.keys,
          logger
        )
      },

      browser: Browsers.ubuntu("Chrome"),

      printQRInTerminal: false,

      markOnlineOnConnect: false,

      generateHighQualityLinkPreview: false,

      syncFullHistory: false,

      connectTimeoutMs: 60_000,

      defaultQueryTimeoutMs: 60_000,

      keepAliveIntervalMs: 25_000,

      emitOwnEvents: true,

      fireInitQueries: true
    });

    currentSocket = sock;

    // ==================================================
    // SAVE CREDENTIALS
    // ==================================================

    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.error(
          "❌ Failed to save credentials:",
          error?.stack || error?.message || error
        );
      }
    });

    // ==================================================
    // CONNECTION UPDATE
    // ==================================================

    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        // ----------------------------------------------
        // QR CODE
        // ----------------------------------------------

        if (
          qr &&
          (
            config.connectionMethod === "qr" ||
            config.connectionMethod === "both"
          )
        ) {
          console.log("\n📲 QR code received.");
          console.log(
            "WhatsApp > Settings > Linked devices > Link a device\n"
          );

          qrcode.generate(qr, {
            small: true
          });
        }

        // ----------------------------------------------
        // PAIRING CODE
        // ----------------------------------------------

        if (
          connection === "connecting" &&
          !state.creds.registered &&
          !pairingRequested &&
          (
            config.connectionMethod === "pairing" ||
            config.connectionMethod === "both"
          )
        ) {
          const phoneNumber = normalizePhoneNumber(
            config.pairingNumber
          );

          if (!phoneNumber) {
            console.error(
              "❌ Invalid PAIRING_NUMBER in environment."
            );
          } else if (phoneNumber.length < 10) {
            console.error(
              "❌ Pairing number is too short."
            );
          } else {
            pairingRequested = true;

            console.log(
              `📱 Requesting pairing code for: ${phoneNumber}`
            );

            // Wait for socket initialization.
            setTimeout(async () => {
              try {
                if (state.creds.registered) {
                  console.log(
                    "ℹ️ Session already registered. Pairing skipped."
                  );
                  return;
                }

                const pairingCode =
                  await sock.requestPairingCode(
                    phoneNumber
                  );

                console.log(
                  "\n======================================"
                );
                console.log("📱 WHATSAPP PAIRING CODE");
                console.log(`🔐 ${pairingCode}`);
                console.log(
                  "======================================"
                );
                console.log(
                  "WhatsApp > Linked devices > Link with phone number"
                );
                console.log(
                  "Enter the latest code immediately.\n"
                );
              } catch (error) {
                pairingRequested = false;

                console.error(
                  "❌ Pairing code request failed:",
                  error?.stack || error?.message || error
                );
              }
            }, 8000);
          }
        }

        // ----------------------------------------------
        // CONNECTED
        // ----------------------------------------------

        if (connection === "open") {
          isStarting = false;
          clearReconnectTimer();

          console.log("\n======================================");
          console.log("✅ SHEIKH-MD CONNECTED SUCCESSFULLY");
          console.log(
            `🤖 Bot: ${config.botName || "SHEIKH-MD"}`
          );
          console.log(
            `⚡ Prefix: ${config.prefix || "."}`
          );
          console.log(
            `🌍 Mode: ${config.botMode || "public"}`
          );
          console.log(
            `👑 SUDO: ${
              SUDO_NUMBER || "Not configured"
            }`
          );
          console.log("💬 Self-number commands: ENABLED");
          console.log("======================================\n");
        }

        // ----------------------------------------------
        // CONNECTION CLOSED
        // ----------------------------------------------

        if (connection === "close") {
          isStarting = false;
          currentSocket = null;

          const statusCode =
            getDisconnectCode(lastDisconnect);

          const shouldLogout =
            statusCode === DisconnectReason.loggedOut;

          const wasReplaced =
            statusCode === DisconnectReason.connectionReplaced;

          const shouldRestart =
            statusCode !== DisconnectReason.loggedOut &&
            statusCode !== DisconnectReason.connectionReplaced;

          console.log(
            `⚠️ Connection closed. Code: ${
              statusCode || "unknown"
            }`
          );

          if (shouldLogout) {
            console.log(
              "❌ WhatsApp session logged out."
            );
            console.log(
              "Delete the old session and pair again."
            );
            return;
          }

          if (wasReplaced) {
            console.log(
              "❌ Connection replaced by another session."
            );
            console.log(
              "Check linked devices and pair again if required."
            );
            return;
          }

          if (shouldRestart) {
            scheduleReconnect();
          }
        }
      }
    );

    // ==================================================
    // MESSAGE HANDLER
    // ==================================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages, type }) => {
        if (type !== "notify") {
          return;
        }

        for (const message of messages) {
          try {
            if (!isValidMessage(message)) {
              continue;
            }

            // Do not ignore fromMe.
            // This enables WhatsApp "Message yourself" commands.
            await handleMessage(
              sock,
              message,
              {
                allowSelf: true
              }
            );
          } catch (error) {
            console.error(
              "❌ Message handling error:",
              error?.stack ||
                error?.message ||
                error
            );
          }
        }
      }
    );
  } catch (error) {
    isStarting = false;
    currentSocket = null;

    console.error(
      "❌ Fatal startup error:",
      error?.stack || error?.message || error
    );

    scheduleReconnect();
  }
}

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearReconnectTimer();

  console.log(`\n🛑 Received ${signal}. Shutting down...`);

  try {
    if (currentSocket) {
      currentSocket.end(undefined);
    }
  } catch (error) {
    console.error(
      "⚠️ Socket shutdown warning:",
      error?.message || error
    );
  }

  try {
    healthServer.close(() => {
      console.log("🌐 Health server stopped.");
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ======================================================
// START APPLICATION
// ======================================================

startBot().catch((error) => {
  console.error(
    "❌ Startup failed:",
    error?.stack || error?.message || error
  );

  process.exit(1);
});
