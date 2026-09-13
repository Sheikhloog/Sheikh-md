const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("SHEIKH-MD is alive and running!");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});
require("dotenv").config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const { handleMessage } = require("./lib/commandHandler");

const SESSION_DIR = path.join(__dirname, "sessions", config.sessionName);
let pairingRequested = false;

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function startBot() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const logger = P({ level: config.logLevel });

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && (config.connectionMethod === "qr" || config.connectionMethod === "both")) {
      console.log("\nScan this QR code from WhatsApp > Linked devices:\n");
      qrcode.generate(qr, { small: true });
    }

    if (
      !sock.authState?.creds?.registered &&
      !pairingRequested &&
      (config.connectionMethod === "pairing" || config.connectionMethod === "both") &&
      config.pairingNumber &&
      !qr
    ) {
      // Pairing is requested after a short delay to allow the socket to initialize.
      pairingRequested = true;
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(config.pairingNumber);
          console.log(`\nWhatsApp Pairing Code: ${code}`);
          console.log("WhatsApp > Linked devices > Link a device > Link with phone number\n");
        } catch (error) {
          console.error("Pairing code error:", error.message);
        }
      }, 3000);
    }

    if (connection === "open") {
      console.log(`\n✅ ${config.botName} connected successfully.`);
      console.log(`Prefix: ${config.prefix}`);
      console.log(`Mode: ${config.botMode}\n`);
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log("Connection closed:", statusCode || "unknown");

      if (shouldReconnect) {
        pairingRequested = false;
        setTimeout(startBot, 5000);
      } else {
        console.log("Logged out. Delete the sessions folder and restart to pair again.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages) {
      try {
        await handleMessage(sock, message);
      } catch (error) {
        console.error("Message handling error:", error);
      }
    }
  });
}

startBot().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
