const config = require("../config");
const { getSender, jidToNumber } = require("./helpers");

function isOwner(message) {
  const senderNumber = jidToNumber(getSender(message));
  return Boolean(config.ownerNumber && senderNumber === config.ownerNumber);
}

async function getGroupMetadata(sock, jid) {
  return sock.groupMetadata(jid);
}

async function isGroupAdmin(sock, message) {
  const jid = message.key.remoteJid;
  if (!jid || !jid.endsWith("@g.us")) return false;

  const metadata = await getGroupMetadata(sock, jid);
  const sender = getSender(message);
  const participant = metadata.participants.find((p) => p.id === sender);
  return Boolean(participant && (participant.admin === "admin" || participant.admin === "superadmin"));
}

async function isBotAdmin(sock, jid) {
  const metadata = await getGroupMetadata(sock, jid);
  const botJid = sock.user?.id;
  const botNumber = botJid?.split(":")[0];
  const participant = metadata.participants.find((p) => p.id === botJid || p.id.startsWith(botNumber));
  return Boolean(participant && (participant.admin === "admin" || participant.admin === "superadmin"));
}

module.exports = { isOwner, isGroupAdmin, isBotAdmin };
