const { isGroup, getChatId, mentionJid } = require("../lib/helpers");
const { isGroupAdmin, isBotAdmin } = require("../lib/permissions");

async function reply(sock, message, text) {
  return sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

function getMentionTargets(message, args) {
  const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length) return mentioned;
  return args.filter((x) => /^\d{8,15}$/.test(x)).map(mentionJid);
}

async function check(sock, message) {
  const jid = getChatId(message);
  if (!isGroup(jid)) {
    await reply(sock, message, "❌ Ye command sirf group mein use hota hai.");
    return false;
  }
  if (!(await isGroupAdmin(sock, message))) {
    await reply(sock, message, "❌ Sirf group admins use kar sakte hain.");
    return false;
  }
  if (!(await isBotAdmin(sock, jid))) {
    await reply(sock, message, "❌ Pehle bot ko group admin banao.");
    return false;
  }
  return true;
}

async function kick({ sock, message, args }) {
  if (!(await check(sock, message))) return;
  const targets = getMentionTargets(message, args);
  if (!targets.length) return reply(sock, message, "Usage: .kick @user");
  await sock.groupParticipantsUpdate(getChatId(message), targets, "remove");
  return reply(sock, message, "✅ User(s) removed.");
}

async function add({ sock, message, args }) {
  if (!(await check(sock, message))) return;
  const targets = getMentionTargets(message, args);
  if (!targets.length) return reply(sock, message, "Usage: .add 923xxxxxxxxx");
  await sock.groupParticipantsUpdate(getChatId(message), targets, "add");
  return reply(sock, message, "✅ Add request completed.");
}

async function promote({ sock, message, args }) {
  if (!(await check(sock, message))) return;
  const targets = getMentionTargets(message, args);
  if (!targets.length) return reply(sock, message, "Usage: .promote @user");
  await sock.groupParticipantsUpdate(getChatId(message), targets, "promote");
  return reply(sock, message, "✅ User(s) promoted.");
}

async function demote({ sock, message, args }) {
  if (!(await check(sock, message))) return;
  const targets = getMentionTargets(message, args);
  if (!targets.length) return reply(sock, message, "Usage: .demote @user");
  await sock.groupParticipantsUpdate(getChatId(message), targets, "demote");
  return reply(sock, message, "✅ User(s) demoted.");
}

module.exports = { kick, add, promote, demote };
