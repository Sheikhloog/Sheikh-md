const os = require("os");
const config = require("../config");
const { formatRuntime, getUptime, memoryUsage, getChatId } = require("../lib/helpers");

const menuText = (prefix) => `╭━━━〔 ${config.botName} 〕━━━╮
┃
┃ ᴘʀᴇғɪx: ${prefix}
┃ ᴍᴏᴅᴇ: ${config.botMode}
┃
┣━━〔 GENERAL 〕
┃ ${prefix}menu
┃ ${prefix}help
┃ ${prefix}ping
┃ ${prefix}alive
┃ ${prefix}runtime
┃ ${prefix}owner
┃ ${prefix}botinfo
┃ ${prefix}echo <text>
┃
┣━━〔 GROUP 〕
┃ ${prefix}groupinfo
┃ ${prefix}admins
┃ ${prefix}tagall
┃ ${prefix}hidetag <text>
┃ ${prefix}link
┃
┣━━〔 MODERATION 〕
┃ ${prefix}kick @user
┃ ${prefix}add 923xxxxxxxxx
┃ ${prefix}promote @user
┃ ${prefix}demote @user
┃
┣━━〔 TOOLS 〕
┃ ${prefix}sticker (reply to image)
┃ ${prefix}ai <question>
┃
╰━━━━━━━━━━━━━━━━━━╯`;

async function reply(sock, message, text, options = {}) {
  return sock.sendMessage(message.key.remoteJid, { text, ...options }, { quoted: message });
}

async function menu({ sock, message, config }) {
  return reply(sock, message, menuText(config.prefix));
}

async function help(ctx) {
  return menu(ctx);
}

async function ping({ sock, message }) {
  const start = Date.now();
  await reply(sock, message, "Testing response...");
  const ms = Date.now() - start;
  return reply(sock, message, `🏓 Pong: ${ms}ms`);
}

async function alive({ sock, message, config }) {
  return reply(sock, message, `✅ ${config.botName} is online.\n\nUse ${config.prefix}menu for commands.`);
}

async function runtime({ sock, message }) {
  return reply(sock, message, `⏱ Runtime: ${formatRuntime(getUptime())}\n💾 RAM: ${memoryUsage()}\n🖥 Platform: ${os.platform()}`);
}

async function owner({ sock, message, config }) {
  return reply(sock, message, `👑 Owner: ${config.ownerName}\n📞 Number: ${config.ownerNumber || "Not configured"}`);
}

async function botinfo({ sock, message, config }) {
  return reply(sock, message, `🤖 Bot: ${config.botName}\n⚙️ Prefix: ${config.prefix}\n🌐 Mode: ${config.botMode}\n📍 Chat: ${getChatId(message)}`);
}

async function echo({ sock, message, rawArgs }) {
  if (!rawArgs) return reply(sock, message, "Usage: .echo your text");
  return reply(sock, message, rawArgs);
}

module.exports = { menu, help, ping, alive, runtime, owner, botinfo, echo };