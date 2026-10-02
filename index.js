/**
 * SHEIKH-MD WhatsApp Bot
 * QR + Pairing Code + Self Number Support
 */

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

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("SHEIKH-MD is alive and running! 🚀");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Health server running on port ${PORT}`);
  });

// ======================================================
// SESSION
// ======================================================

const SESSION_DIR = path.join(
  __dirname,
  "sessions",
  config.sessionName || "sheikh-md"
);

let isStarting = false;
let reconnectTimer = null;

// ======================================================
// HELPERS
// ======================================================

function normalizePhoneNumber(number) {
  return String(number || "")
    .replace(/[^\d]/g, "")
    .replace(/^00/, "");
}

function isValidMessage(message) {
  if (!message?.message) return false;

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

// ======================================================
// START BOT
// ======================================================

async function startBot() {
  if (isStarting) {
    console.log("⚠️ Bot startup already in progress...");
    return;
  }

  isStarting = true;

  // Pairing state must be fresh for every new socket
  let pairingRequested = false;

  try {
    fs.mkdirSync(SESSION_DIR, {
      recursive: true
    });

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

    // ==================================================
    // SAVE CREDENTIALS
    // ==================================================

    sock.ev.on("creds.update", saveCreds);

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
              "❌ Invalid pairingNumber in config.js"
            );
            return;
          }

          if (phoneNumber.length < 10) {
            console.error(
              "❌ Pairing number is too short."
            );
            return;
          }

          pairingRequested = true;

          console.log(
            `📱 Requesting pairing code for: ${phoneNumber}`
          );

          // Wait for socket initialization
          setTimeout(async () => {
            try {
              if (state.creds.registered) {
                console.log(
                  "ℹ️ Session is already registered. Pairing skipped."
                );
                return;
              }

              const pairingCode =
                await sock.requestPairingCode(
                  phoneNumber
                );

              console.log("\n======================================");
              console.log("📱 WHATSAPP PAIRING CODE");
              console.log(`🔐 ${pairingCode}`);
              console.log("======================================");
              console.log(
                "Open WhatsApp > Linked devices > Link with phone number"
              );
              console.log(
                "Enter this latest code immediately.\n"
              );
            } catch (error) {
              pairingRequested = false;

              console.error(
                "❌ Pairing code request failed:",
                error?.stack || error
              );
            }
          }, 8000);
        }

        // ----------------------------------------------
        // CONNECTED
        // ----------------------------------------------

        if (connection === "open") {
          isStarting = false;

          console.log("\n======================================");
          console.log("✅ SHEIKH-MD connected successfully!");
          console.log(
            `🤖 Bot: ${config.botName || "SHEIKH-MD"}`
          );
          console.log(
            `⚡ Prefix: ${config.prefix || "."}`
          );
          console.log(
            `🌍 Mode: ${config.botMode || "public"}`
          );
          console.log("💬 Self-number commands: ENABLED");
          console.log("======================================\n");
        }

        // ----------------------------------------------
        // CONNECTION CLOSED
        // ----------------------------------------------

        if (connection === "close") {
          isStarting = false;

          const statusCode =
            getDisconnectCode(lastDisconnect);

          const shouldLogout =
            statusCode === DisconnectReason.loggedOut;

          const wasReplaced =
            statusCode === DisconnectReason.connectionReplaced;

          console.log(
            `⚠️ Connection closed. Code: ${
              statusCode || "unknown"
            }`
          );

          if (shouldLogout || wasReplaced) {
            console.log(
              "❌ Session logged out or replaced."
            );
            console.log(
              "Delete only the old session and pair again if required."
            );
            return;
          }

          if (!reconnectTimer) {
            console.log(
              "🔄 Reconnecting in 5 seconds..."
            );

            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;

              startBot().catch((error) => {
                console.error(
                  "❌ Reconnect error:",
                  error?.message || error
                );
              });
            }, 5000);
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
        if (type !== "notify") return;

        for (const message of messages) {
          try {
            if (!isValidMessage(message)) continue;

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
              error?.stack || error?.message || error
            );
          }
        }
      }
    );
  } catch (error) {
    isStarting = false;

    console.error(
      "❌ Fatal startup error:",
      error?.stack || error?.message || error
    );

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        startBot().catch((err) => {
          console.error(
            "❌ Startup retry error:",
            err?.message || err
          );
        });
      }, 5000);
    }
  }
}

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
