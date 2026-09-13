const config = require("../config");
const { getText, normalizeCommand } = require("./helpers");

const general = require("../commands/general");
const group = require("../commands/group");
const moderation = require("../commands/moderation");
const sticker = require("../commands/sticker");
const download = require("../commands/download");

// ======================================================
// COMMAND REGISTRY
// ======================================================

const commands = new Map();

for (const plugin of [
  general,
  group,
  moderation,
  sticker,
  download
]) {
  for (const [name, fn] of Object.entries(plugin)) {
    if (typeof fn !== "function") continue;

    commands.set(name.toLowerCase(), fn);
  }
}

// ======================================================
// MESSAGE HANDLER
// ======================================================

async function handleMessage(sock, message, options = {}) {
  if (!message || !message.message) return;

  // Self-number messages are allowed.
  // Do NOT add: if (message.key.fromMe) return;

  const text = getText(message);

  if (!text || !text.trim()) return;

  const parsed = normalizeCommand(
    text,
    config.prefix || "."
  );

  if (!parsed) return;

  const commandName = parsed.command.toLowerCase();
  const command = commands.get(commandName);

  if (!command) return;

  const context = {
    sock,
    message,
    args: parsed.args || [],
    rawArgs: parsed.rawArgs || "",
    command: commandName,
    config,

    isSelf: Boolean(message.key?.fromMe),

    sender:
      message.key?.participant ||
      message.key?.remoteJid ||
      "",

    chat: message.key?.remoteJid || "",

    isGroup: Boolean(
      message.key?.remoteJid?.endsWith("@g.us")
    )
  };

  try {
    await command(context);
  } catch (error) {
    console.error(
      `❌ Error in command .${commandName}:`,
      error?.stack || error?.message || error
    );

    try {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `❌ Error: ${error?.message || "Something went wrong"}`
        },
        {
          quoted: message
        }
      );
    } catch (sendError) {
      console.error(
        "❌ Error sending error message:",
        sendError?.message || sendError
      );
    }
  }
}

module.exports = {
  handleMessage,
  commands
};
