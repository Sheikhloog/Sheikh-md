const config = require("../config");
const { getText, normalizeCommand } = require("./helpers");

const general = require("../commands/general");
const group = require("../commands/group");
const moderation = require("../commands/moderation");
const sticker = require("../commands/sticker");
const ai = require("../commands/ai");

// ======================================================
// COMMAND REGISTRY
// ======================================================

const commands = new Map();

for (const plugin of [
  general,
  group,
  moderation,
  sticker,
  ai
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

  /*
   * Self-number support enabled.
   *
   * Important:
   * fromMe messages are not ignored anymore.
   * This allows commands from WhatsApp "Message yourself".
   */

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

    // Self-message information
    isSelf: Boolean(message.key?.fromMe),

    // Sender and chat information
    sender: message.key?.participant || message.key?.remoteJid,

    chat: message.key?.remoteJid,

    isGroup: Boolean(
      message.key?.remoteJid?.endsWith("@g.us")
    )
  };

  try {
    await command(context);
  } catch (error) {
    console.error(
      `❌ Error in command .${commandName}:`,
      error?.message || error
    );
  }
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  handleMessage,
  commands
};
