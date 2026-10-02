const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const sharp = require("sharp");

async function sticker({ sock, message }) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imageMessage = message.message?.imageMessage || quoted?.imageMessage;

  if (!imageMessage) {
    return sock.sendMessage(
      message.key.remoteJid,
      { text: "🖼️ Image ko caption ke sath ya reply karke `.sticker` bhejein." },
      { quoted: message }
    );
  }

  try {
    const target = message.message?.imageMessage
      ? message
      : {
          key: {
            remoteJid: message.key.remoteJid,
            id: message.message.extendedTextMessage.contextInfo.stanzaId
          },
          message: quoted
        };

    const buffer = await downloadMediaMessage(
      target,
      "buffer",
      {},
      { logger: console }
    );

    const webp = await sharp(buffer)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp()
      .toBuffer();

    return sock.sendMessage(
      message.key.remoteJid,
      { sticker: webp },
      { quoted: message }
    );
  } catch (error) {
    console.error("Sticker error:", error);
    return sock.sendMessage(
      message.key.remoteJid,
      { text: "❌ Sticker create nahi ho saka. Dobara try karein." },
      { quoted: message }
    );
  }
}

module.exports = { sticker };
