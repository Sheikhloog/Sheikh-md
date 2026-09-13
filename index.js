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
// HEALTH SERVER - RENDER / HOSTING
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
// SESSION CONFIGURATION
// ======================================================

const SESSION_DIR = path.join(
  __dirname,
  "sessions",
  config.sessionName || "sheikh-md"
);

let isStarting = false;
let reconnectTimer = null;
let pairingRequested = false;

// ======================================================
// SAFE MESSAGE CHECK
// ======================================================

function isValidMessage(message) {
  if (!message || !message.message) return false;

  // Ignore protocol messages
  if (message.key?.remoteJid === "status@broadcast") {
    return false;
  }

  return true;
}

// ======================================================
// START BOT
// ======================================================

async function startBot() {
  if (isStarting) {
    console.log("⚠️ Bot is already starting...");
    return;
  }

  isStarting = true;

  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(
      SESSION_DIR
    );

    const { version } = await fetchLatestBaileysVersion();

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
    // SAVE SESSION CREDENTIALS
    // ==================================================

    sock.ev.on("creds.update", saveCreds);

    // ==================================================
    // CONNECTION UPDATE
    // ==================================================

    sock.ev.on("connection.update", async (update) => {
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
        console.log("\n📲 Scan this QR code:");
        console.log(
          "WhatsApp > Linked devices > Link a device\n"
        );

        qrcode.generate(qr, {
          small: true
        });
      }

      // ----------------------------------------------
      // PAIRING CODE
      // ----------------------------------------------

      if (
        !state.creds.registered &&
        !pairingRequested &&
        (
          config.connectionMethod === "pairing" ||
          config.connectionMethod === "both"
        ) &&
        config.pairingNumber
      ) {
        pairingRequested = true;

        // Pairing code request after socket initialization
        setTimeout(async () => {
          try {
            const phoneNumber = String(config.pairingNumber)
              .replace(/\D/g, "");

            if (!phoneNumber) {
              console.log(
                "❌ Invalid pairing number in config.js"
              );
              return;
            }

            const pairingCode = await sock.requestPairingCode(
              phoneNumber
            );

            console.log("\n======================================");
            console.log("📱 WhatsApp Pairing Code:");
            console.log(`🔐 ${pairingCode}`);
            console.log("======================================");
            console.log(
              "WhatsApp > Linked devices > Link a device > Link with phone number\n"
            );
          } catch (error) {
            console.error(
              "❌ Pairing code error:",
              error?.message || error
            );

            pairingRequested = false;
          }
        }, 5000);
      }

      // ----------------------------------------------
      // CONNECTED
      // ----------------------------------------------

      if (connection === "open") {
        isStarting = false;
        pairingRequested = true;

        console.log("\n======================================");
        console.log("✅ SHEIKH-MD connected successfully!");
        console.log(`🤖 Bot: ${config.botName || "SHEIKH-MD"}`);
        console.log(`⚡ Prefix: ${config.prefix || "."}`);
        console.log(`🌍 Mode: ${config.botMode || "public"}`);
        console.log("💬 Self-number commands: ENABLED");
        console.log("======================================\n");
      }

      // ----------------------------------------------
      // CONNECTION CLOSED
      // ----------------------------------------------

      if (connection === "close") {
        isStarting = false;

        const statusCode = new Boom(
          lastDisconnect?.error
        )?.output?.statusCode;

        const loggedOut =
          statusCode === DisconnectReason.loggedOut;

        const connectionReplaced =
          statusCode === DisconnectReason.connectionReplaced;

        console.log(
          `⚠️ Connection closed: ${
            statusCode || "unknown"
          }`
        );

        if (loggedOut || connectionReplaced) {
          console.log(
            "❌ Session logged out or replaced."
          );

          console.log(
            "Delete the sessions folder and pair again."
          );

          return;
        }

        if (!reconnectTimer) {
          console.log("🔄 Reconnecting in 5 seconds...");

          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            pairingRequested = false;
            startBot().catch(console.error);
          }, 5000);
        }
      }
    });

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

            /*
             * Self-number support:
             * fromMe messages are intentionally NOT ignored here.
             *
             * commandHandler.js must also allow message.key.fromMe.
             */

            await handleMessage(sock, message, {
              allowSelf: true
            });
          } catch (error) {
            console.error(
              "❌ Message handling error:",
              error?.message || error
            );
          }
        }
      }
    );

  } catch (error) {
    isStarting = false;

    console.error(
      "❌ Fatal startup error:",
      error?.message || error
    );

    setTimeout(() => {
      startBot().catch(console.error);
    }, 5000);
  }
}

// ======================================================
// START APPLICATION
// ======================================================

startBot().catch((error) => {
  console.error("❌ Startup failed:", error);
  process.exit(1);
});
