/**
 * SHEIKH-MD WhatsApp Bot
 * Browser QR + Pairing Code + Self Number Support
 * Custom Session Directory + SUDO Environment Support
 */

"use strict";

require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const QRCode = require("qrcode");

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

const PORT = Number(process.env.PORT || 3000);

const SESSION_NAME = String(
  process.env.SESSION_NAME ||
    config.sessionName ||
    "sheikh-md"
).trim();

const SESSION_DIR = path.resolve(
  process.env.SESSION_DIR ||
    path.join(__dirname, "sessions", SESSION_NAME)
);

const SESSION_ID = String(
  process.env.SESSION_ID || ""
).trim();

const SUDO_NUMBER = String(
  process.env.SUDO ||
    config.sudo ||
    ""
).replace(/\D/g, "");

const CONNECTION_METHOD = String(
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

let latestQR = null;
let qrGeneratedAt = null;

/* ======================================================
   HEALTH SERVER + BROWSER QR PAGE
====================================================== */

const healthServer = http.createServer((req, res) => {
  /*
    ================================================
    BROWSER QR PAGE
    URL: https://your-app.onrender.com/qr
    ================================================
  */

  if (req.url === "/qr") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });

    return res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>SHEIKH-MD QR Pairing</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: Arial, Helvetica, sans-serif;
      background:
        radial-gradient(
          circle at top,
          #163b28 0%,
          #07110d 45%,
          #030806 100%
        );
      color: #ffffff;
    }

    .card {
      width: 100%;
      max-width: 440px;
      text-align: center;
      padding: 28px 20px 24px;
      border: 1px solid #285a40;
      border-radius: 24px;
      background: rgba(13, 29, 21, 0.96);
      box-shadow:
        0 20px 70px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .logo {
      width: 65px;
      height: 65px;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20px;
      background: #20c76a;
      font-size: 32px;
      box-shadow: 0 8px 25px rgba(32, 199, 106, 0.22);
    }

    h1 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 0.5px;
    }

    .subtitle {
      margin-top: 9px;
      margin-bottom: 24px;
      color: #a9c9b5;
      font-size: 14px;
    }

    .qr-wrapper {
      width: 100%;
      min-height: 315px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 17px;
      border-radius: 18px;
      background: #ffffff;
      box-shadow: 0 10px 35px rgba(0, 0, 0, 0.25);
    }

    #qrImage {
      display: none;
      width: 100%;
      max-width: 285px;
      height: auto;
      image-rendering: pixelated;
    }

    #status {
      display: block;
      color: #263d2d;
      font-size: 15px;
      line-height: 1.7;
      font-weight: 600;
    }

    .steps {
      margin-top: 22px;
      padding: 16px;
      border: 1px solid #214a34;
      border-radius: 15px;
      background: #11271b;
      color: #d9eee0;
      text-align: left;
      font-size: 14px;
      line-height: 1.9;
    }

    .steps strong {
      color: #45e58b;
    }

    .footer {
      margin-top: 20px;
      color: #789987;
      font-size: 12px;
    }

    .badge {
      display: inline-block;
      margin-top: 17px;
      padding: 7px 14px;
      border-radius: 30px;
      background: #1b6b43;
      color: #ffffff;
      font-size: 12px;
      font-weight: bold;
    }
  </style>
</head>

<body>
  <div class="card">
    <div class="logo">📲</div>

    <h1>SHEIKH-MD</h1>

    <div class="subtitle">
      WhatsApp QR Pairing Panel
    </div>

    <div class="qr-wrapper">
      <img
        id="qrImage"
        alt="WhatsApp QR Code"
      />

      <div id="status">
        ⏳ Waiting for QR code...
      </div>
    </div>

    <div class="steps">
      <strong>QR Scan Karne Ka Tareeqa:</strong><br />
      1. WhatsApp open karo<br />
      2. Settings par jao<br />
      3. Linked devices select karo<br />
      4. Link a device par tap karo<br />
      5. Neeche wala QR scan karo
    </div>

    <div class="badge">
      🔄 QR Auto Refresh Enabled
    </div>

    <div class="footer">
      SHEIKH-MD WhatsApp Bot
    </div>
  </div>

  <script>
    const qrImage = document.getElementById("qrImage");
    const statusText = document.getElementById("status");

    async function loadQR() {
      try {
        const response = await fetch(
          "/qr-data?t=" + Date.now(),
          {
            cache: "no-store"
          }
        );

        const data = await response.json();

        if (data.connected) {
          qrImage.style.display = "none";
          statusText.style.display = "block";
          statusText.innerHTML =
            "✅ WhatsApp connected successfully!<br />" +
            "Bot is now online.";

          return;
        }

        if (data.qr) {
          qrImage.src = data.qr;
          qrImage.style.display = "block";
          statusText.style.display = "none";
        } else {
          qrImage.style.display = "none";
          statusText.style.display = "block";
          statusText.innerHTML =
            "⏳ QR code generate ho raha hai...<br />" +
            "Please wait.";
        }
      } catch (error) {
        qrImage.style.display = "none";
        statusText.style.display = "block";
        statusText.innerHTML =
          "⚠️ QR load nahi ho saka.<br />" +
          "Dobara try ho raha hai...";
      }
    }

    loadQR();
    setInterval(loadQR, 2500);
  </script>
</body>
</html>
    `);
  }

  /*
    ================================================
    QR DATA API
    ================================================
  */

  if (req.url.startsWith("/qr-data")) {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });

    return res.end(
      JSON.stringify({
        success: true,
        qr: latestQR,
        generatedAt: qrGeneratedAt,
        connected: Boolean(currentSocket?.user)
      })
    );
  }

  /*
    ================================================
    HEALTH API
    ================================================
  */

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });

    return res.end(
      JSON.stringify({
        success: true,
        status: "ok",
        bot: config.botName || "SHEIKH-MD",
        service: "SHEIKH-MD WhatsApp Bot",
        sessionName: SESSION_NAME,
        sessionId: SESSION_ID || null,
        sessionDirectory: SESSION_DIR,
        qrPage: "/qr",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      })
    );
  }

  /*
    ================================================
    404 ROUTE
    ================================================
  */

  res.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8"
  });

  res.end(
    JSON.stringify({
      success: false,
      message: "Route not found"
    })
  );
});

healthServer.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🌐 Health server running on port ${PORT}`
  );

  console.log(
    `📲 Browser QR route available at: /qr`
  );
});

/* ======================================================
   HELPERS
====================================================== */

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
      lastDisconnect?.error?.output?.statusCode ||
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

      connectTimeoutMs: 60000,

      defaultQueryTimeoutMs: 60000,

      keepAliveIntervalMs: 25000,

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
           BROWSER QR CODE
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
            "Open your Render URL + /qr in browser."
          );

          try {
            latestQR = await QRCode.toDataURL(
              qr,
              {
                errorCorrectionLevel: "M",
                margin: 2,
                width: 400
              }
            );

            qrGeneratedAt =
              new Date().toISOString();

            console.log(
              "✅ QR image is available at: /qr"
            );
          } catch (error) {
            console.error(
              "❌ Failed to generate browser QR:",
              error?.stack ||
                error?.message ||
                error
            );
          }
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

          latestQR = null;
          qrGeneratedAt = null;

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

          latestQR = null;
          qrGeneratedAt = null;

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
              commands.
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