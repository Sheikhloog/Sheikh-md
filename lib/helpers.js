const os = require("os");

function getText(message) {
  const msg = message.message || {};

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ""
  ).trim();
}

function getSender(message) {
  return message.key.participant || message.key.remoteJid || "";
}

function getChatId(message) {
  return message.key.remoteJid || "";
}

function isGroup(jid = "") {
  return jid.endsWith("@g.us");
}

function jidToNumber(jid = "") {
  return jid.split("@")[0].split(":")[0];
}

function formatRuntime(seconds) {
  seconds = Number(seconds || 0);

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function getUptime() {
  return process.uptime();
}

function memoryUsage() {
  const used = process.memoryUsage().rss / 1024 / 1024;
  return `${used.toFixed(1)} MB`;
}

function normalizeCommand(text = "", prefix = ".") {
  text = String(text).trim();

  if (!text.startsWith(prefix)) return null;

  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) return null;

  const parts = withoutPrefix.split(/\s+/);
  const command = parts.shift().toLowerCase();

  return {
    command,
    args: parts,
    rawArgs: parts.join(" ")
  };
}

function mentionJid(number) {
  const cleanNumber = String(number).replace(/\D/g, "");
  return `${cleanNumber}@s.whatsapp.net`;
}

module.exports = {
  getText,
  getSender,
  getChatId,
  isGroup,
  jidToNumber,
  formatRuntime,
  getUptime,
  memoryUsage,
  normalizeCommand,
  mentionJid
};
