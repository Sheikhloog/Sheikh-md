const { isGroup, getChatId, mentionJid } = require("../lib/helpers");
const { isGroupAdmin, isBotAdmin } = require("../lib/permissions");

async function reply(sock, message, text, options = {}) {
  return sock.sendMessage(message.key.remoteJid, { text, ...options }, { quoted: message });
}

async function requireGroup(sock, message) {
  if (!isGroup(getChatId(message))) {
    await reply(sock, message, "❌ Ye command sirf group mein use hota hai.");
    return false;
  }
  return true;
}

async function groupinfo({ sock, message }) {
  if (!(await requireGroup(sock, message))) return;
  const metadata = await sock.groupMetadata(getChatId(message));
  return reply(sock, message, `👥 Group: ${metadata.subject}\n🆔 ID: ${metadata.id}\n👤 Members: ${metadata.participants.length}\n📝 Description: ${metadata.desc || "None"}`);
}

async function admins({ sock, message }) {
  if (!(await requireGroup(sock, message))) return;
  const metadata = await sock.groupMetadata(getChatId(message));
  const adminsList = metadata.participants
    .filter((p) => p.admin)
    .map((p) => `@${p.id.split("@")[0]}`)
    .join("\n");
  return reply(sock, message, `👑 Group Admins:\n${adminsList || "No admins found"}`, {
    mentions: metadata.participants.filter((p) => p.admin).map((p) => p.id)
  });
}

async function tagall({ sock, message }) {
  if (!(await requireGroup(sock, message))) return;
  if (!(await isGroupAdmin(sock, message))) {
    return reply(sock, message, "❌ Sirf group admins use kar sakte hain.");
  }

  const metadata = await sock.groupMetadata(getChatId(message));
  const mentions = metadata.participants.map((p) => p.id);
  const text = mentions.map((jid) => `@${jid.split("@")[0]}`).join(" ");
  return reply(sock, message, `📢 Attention everyone!\n\n${text}`, { mentions });
}

async function hidetag({ sock, message, rawArgs }) {
  if (!(await requireGroup(sock, message))) return;
  if (!(await isGroupAdmin(sock, message))) {
    return reply(sock, message, "❌ Sirf group admins use kar sakte hain.");
  }

  const metadata = await sock.groupMetadata(getChatId(message));
  const mentions = metadata.participants.map((p) => p.id);
  return reply(sock, message, rawArgs || "📢", { mentions });
}

async function link({ sock, message }) {
  if (!(await requireGroup(sock, message))) return;
  const code = await sock.groupInviteCode(getChatId(message));
  return reply(sock, message, `🔗 Group Link:\nhttps://chat.whatsapp.com/${code}`);
}

module.exports = { groupinfo, admins, tagall, hidetag, link };
