/**
 * SHEIKH-MD WhatsApp Bot
 * QR + Pairing Code + Self Number Support
 * Custom Session Directory + SUDO Environment Support
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

/* ======================================================
   ENVIRONMENT CONFIGURATION
====================================================== */

const PORT = Number(
  process.env.PORT || 3000
);

const SESSION_NAME =
  String(
    process.env.SESSION_NAME ||
      config.sessionName ||
      "sheikh-md"
  ).trim();

/*
  SESSION_DIR priority:

  1. SESSION_DIR from environment
  2. ./sessions/SESSION_NAME

  Example:
  SESSION_DIR=./sessions/sheikh-md
*/

const SESSION_DIR = path.resolve(
  process.env.SESSION_DIR ||
    path.join(
      __dirname,
      "sessions",
      SESSION_NAME
    )
);

const SESSION_ID = String(
  process.env.SESSION_ID || ""
).trim();

const SUDO_NUMBER = String(
  process.env.SUDO ||
    config.sudo ||
    ""
).replace(/\D/g, "");

const CONNECTION_METHOD =
  String(
    process.env.CONNECTION_METHOD ||
      config.connectionMethod ||
      "both"
  ).toLowerCase();

const PAIRING_NUMBER = String(
  process.env.PAIRING_NUMBER ||
    config.pairingNumber ||
    ""
).replace(/\D/g, "");

/* ======================================================
   RUNTIME STATE
====================================================== */

let isStarting = false;
let reconnectTimer = null;
let currentSocket = null;
let shuttingDown = false;
let restartAttempts = 0;

/* ======================================================
   HEALTH SERVER
====================================================== */

const healthServer = http.createServer(
  (req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });

      return res.end(
        JSON.stringify({
          success: true,
          status: "ok",
          bot:
            config.botName ||
            "SHEIKH-MD",
          service:
            "SHEIKH-MD WhatsApp Bot",
          sessionName: SESSION_NAME,
          sessionId:
            SESSION_ID || null,
          sessionDirectory:
            SESSION_DIR,
          uptime: Math.floor(
            process.uptime()
          ),
          timestamp:
            new Date().toISOString()
        })
      );
    }

    res.writeHead(404, {
      "Content-Type":
        "application/json; charset=utf-8"
    });

    res.end(
      JSON.stringify({
        success: false,
        message: "Route not found"
      })
    );
  }
);

healthServer.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🌐 Health server running on port ${PORT}`
    );
  }
);

/* ======================================================
   HELPERS
====================================================== */

function normalizePhoneNumber(number) {
  return String(number || "")
    .replace(/[^\d]/g, "")
    .replace(/^00/, "");
}

function isValidMessage(message) {
  if (!message?.message) {
    return false;
  }

  if (
    message.key?.remoteJid ===
    "status@broadcast"
  ) {
    return false;
  }

  return true;
}

function getDisconnectCode(lastDisconnect) {
  try {
    return new Boom(
      lastDisconnect?.error
    ).output.statusCode;
  } catch {
    return (
      lastDisconnect?.error?.output
        ?.statusCode ||
      lastDisconnect?.error?.statusCode ||
      0
    );
  }
}

function ensureSessionDirectory() {
  try {
    fs.mkdirSync(SESSION_DIR, {
      recursive: true
    });
  } catch (error) {
    console.error(
      "❌ Unable to create session directory:",
      error?.message || error
    );

    throw error;
  }
}

function printStartupInformation() {
  console.log(
    "\n======================================"
  );
  console.log(
    "🚀 SHEIKH-MD STARTING"
  );
  console.log(
    "======================================"
  );

  console.log(
    `🤖 Bot Name: ${
      config.botName || "SHEIKH-MD"
    }`
  );

  console.log(
    `👤 Owner: ${
      config.ownerName || "Not set"
    }`
  );

  console.log(
    `⚡ Prefix: ${
      config.prefix || "."
    }`
  );

  console.log(
    `🌍 Mode: ${
      config.botMode || "public"
    }`
  );

  console.log(
    `📁 Session Name: ${SESSION_NAME}`
  );

  console.log(
    `📂 Session Directory: ${SESSION_DIR}`
  );

  console.log(
    `🔐 Session ID: ${
      SESSION_ID
        ? "Provided"
        : "Not provided"
    }`
  );

  console.log(
    `👑 SUDO: ${
      SUDO_NUMBER || "Not configured"
    }`
  );

  console.log(
    `🔌 Connection Method: ${
      CONNECTION_METHOD
    }`
  );

  console.log(
    `📱 Pairing Number: ${
      PAIRING_NUMBER
        ? "Configured"
        : "Not configured"
    }`
  );

  console.log(
    "======================================\n"
  );
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (
    shuttingDown ||
    reconnectTimer
  ) {
    return;
  }

  restartAttempts += 1;

  const delay = Math.min(
    5000 * restartAttempts,
    60000
  );

  console.log(
    `🔄 Reconnecting in ${
      Math.floor(delay / 1000)
    } seconds...`
  );

  reconnectTimer = setTimeout(
    async () => {
      reconnectTimer = null;

      try {
        await startBot();
      } catch (error) {
        console.error(
          "❌ Reconnect error:",
          error?.stack ||
            error?.message ||
            error
        );

        scheduleReconnect();
      }
    },
    delay
  );
}

function isConnectionMethodAllowed(method) {
  return (
    method === "qr" ||
    method === "pairing" ||
    method === "both"
  );
}

/* ======================================================
   START BOT
====================================================== */

async function startBot() {
  if (shuttingDown) {
    return;
  }

  if (isStarting) {
    console.log(
      "⚠️ Bot startup already in progress..."
    );

    return;
  }

  isStarting = true;

  let pairingRequested = false;

  try {
    ensureSessionDirectory();
    printStartupInformation();

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      SESSION_DIR
    );

    const {
      version,
      isLatest
    } = await fetchLatestBaileysVersion();

    console.log(
      `📦 Baileys version: ${version.join(".")}`
    );

    console.log(
      `📦 Latest version: ${
        isLatest ? "Yes" : "No"
      }`
    );

    const logger = P({
      level:
        config.logLevel ||
        process.env.LOG_LEVEL ||
        "silent"
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

      browser: Browsers.ubuntu(
        "Chrome"
      ),

      printQRInTerminal: false,

      markOnlineOnConnect: false,

      generateHighQualityLinkPreview:
        false,

      syncFullHistory: false,

      connectTimeoutMs: 60_000,

      defaultQueryTimeoutMs: 60_000,

      keepAliveIntervalMs: 25_000,

      emitOwnEvents: true,

      fireInitQueries: true
    });

    currentSocket = sock;

    /* ==================================================
       SAVE CREDENTIALS
    ================================================== */

    sock.ev.on(
      "creds.update",
      async () => {
        try {
          await saveCreds();
        } catch (error) {
          console.error(
            "❌ Failed to save credentials:",
            error?.stack ||
              error?.message ||
              error
          );
        }
      }
    );

    /* ==================================================
       CONNECTION UPDATE
    ================================================== */

    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        /* ----------------------------------------------
           QR CODE
        ---------------------------------------------- */

        if (
          qr &&
          (
            CONNECTION_METHOD === "qr" ||
            CONNECTION_METHOD === "both"
          )
        ) {
          console.log(
            "\n📲 QR code received."
          );

          console.log(
            "WhatsApp > Settings > Linked devices > Link a device\n"
          );

          qrcode.generate(qr, {
            small: true
          });
        }

        /* ----------------------------------------------
           PAIRING CODE
        ---------------------------------------------- */

        if (
          connection === "connecting" &&
          !state.creds.registered &&
          !pairingRequested &&
          (
            CONNECTION_METHOD === "pairing" ||
            CONNECTION_METHOD === "both"
          )
        ) {
          if (!PAIRING_NUMBER) {
            console.error(
              "❌ Pairing number is not configured."
            );
          } else if (
            PAIRING_NUMBER.length < 10
          ) {
            console.error(
              "❌ Pairing number is too short."
            );
          } else {
            pairingRequested = true;

            console.log(
              `📱 Requesting pairing code for: ${PAIRING_NUMBER}`
            );

            setTimeout(
              async () => {
                try {
                  if (
                    state.creds.registered
                  ) {
                    console.log(
                      "ℹ️ Session already registered. Pairing skipped."
                    );

                    return;
                  }

                  const pairingCode =
                    await sock.requestPairingCode(
                      PAIRING_NUMBER
                    );

                  console.log(
                    "\n======================================"
                  );

                  console.log(
                    "📱 WHATSAPP PAIRING CODE"
                  );

                  console.log(
                    `🔐 ${pairingCode}`
                  );

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
                    error?.stack ||
                      error?.message ||
                      error
                  );
                }
              },
              8000
            );
          }
        }

        /* ----------------------------------------------
           CONNECTED
        ---------------------------------------------- */

        if (connection === "open") {
          isStarting = false;
          restartAttempts = 0;
          clearReconnectTimer();

          console.log(
            "\n======================================"
          );

          console.log(
            "✅ SHEIKH-MD CONNECTED SUCCESSFULLY"
          );

          console.log(
            `🤖 Bot: ${
              config.botName ||
              "SHEIKH-MD"
            }`
          );

          console.log(
            `⚡ Prefix: ${
              config.prefix || "."
            }`
          );

          console.log(
            `🌍 Mode: ${
              config.botMode || "public"
            }`
          );

          console.log(
            `👑 SUDO: ${
              SUDO_NUMBER ||
              "Not configured"
            }`
          );

          console.log(
            "💬 Self-number commands: ENABLED"
          );

          console.log(
            `📂 Session saved at: ${SESSION_DIR}`
          );

          console.log(
            "======================================\n"
          );
        }

        /* ----------------------------------------------
           CONNECTION CLOSED
        ---------------------------------------------- */

        if (connection === "close") {
          isStarting = false;
          currentSocket = null;

          const statusCode =
            getDisconnectCode(
              lastDisconnect
            );

          const shouldLogout =
            statusCode ===
            DisconnectReason.loggedOut;

          const wasReplaced =
            statusCode ===
            DisconnectReason.connectionReplaced;

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
              "Delete the session folder and pair again."
            );

            return;
          }

          if (wasReplaced) {
            console.log(
              "❌ Connection replaced by another session."
            );

            console.log(
              "Check WhatsApp Linked Devices."
            );

            return;
          }

          scheduleReconnect();
        }
      }
    );

    /* ==================================================
       MESSAGE HANDLER
    ================================================== */

    sock.ev.on(
      "messages.upsert",
      async ({
        messages,
        type
      }) => {
        if (type !== "notify") {
          return;
        }

        for (const message of messages) {
          try {
            if (
              !isValidMessage(message)
            ) {
              continue;
            }

            /*
              fromMe messages are intentionally
              not ignored. This enables self-number
              commands from WhatsApp "Message yourself".
            */

            await handleMessage(
              sock,
              message,
              {
                allowSelf: true,
                sudoNumber: SUDO_NUMBER,
                sessionId: SESSION_ID,
                sessionName: SESSION_NAME
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
      error?.stack ||
        error?.message ||
        error
    );

    scheduleReconnect();
  }
}

/* ======================================================
   GRACEFUL SHUTDOWN
====================================================== */

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearReconnectTimer();

  console.log(
    `\n🛑 Received ${signal}. Shutting down...`
  );

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
      console.log(
        "🌐 Health server stopped."
      );

      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

/* ======================================================
   START APPLICATION
====================================================== */

startBot().catch((error) => {
  console.error(
    "❌ Startup failed:",
    error?.stack ||
      error?.message ||
      error
  );

  process.exit(1);
});