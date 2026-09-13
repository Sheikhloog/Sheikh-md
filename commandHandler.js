const config = require("../config");
const { getText, normalizeCommand } = require("./helpers");

const general = require("../commands/general");
const group = require("../commands/group");
const moderation = require("../commands/moderation");
const sticker = require("../commands/sticker");
const ai = require("../commands/ai");

const commands = new Map();

for (const plugin of [general, group, moderation, sticker, ai]) {
  for (const [name, fn] of Object.entries(plugin)) {
    commands.set(name.toLowerCase(), fn);
  }
}

async function handleMessage(sock, message) {
  if (!message.message) return;
  if (message.key.fromMe) return;

  const text = getText(message);
  const parsed = normalizeCommand(text, config.prefix);
  if (!parsed) return;

  const command = commands.get(parsed.command);
  if (!command) return;

  const context = {
    sock,
    message,
    args: parsed.args,
    rawArgs: parsed.rawArgs,
    command: parsed.command,
    config
  };

  await command(context);
}

module.exports = { handleMessage, commands };