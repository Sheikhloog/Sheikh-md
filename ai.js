const axios = require("axios");
const config = require("../config");

async function ai({ sock, message, rawArgs }) {
  if (!rawArgs) {
    return sock.sendMessage(
      message.key.remoteJid,
      { text: `Usage: ${config.prefix}ai your question` },
      { quoted: message }
    );
  }

  if (!config.aiApiUrl) {
    return sock.sendMessage(
      message.key.remoteJid,
      { text: "⚠️ AI API configured nahi hai. `.env` mein AI_API_URL aur AI_API_KEY set karein." },
      { quoted: message }
    );
  }

  try {
    const response = await axios.post(
      config.aiApiUrl,
      { prompt: rawArgs, question: rawArgs, message: rawArgs },
      {
        headers: {
          Authorization: config.aiApiKey ? `Bearer ${config.aiApiKey}` : undefined,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    const answer =
      response.data?.answer ||
      response.data?.response ||
      response.data?.text ||
      response.data?.result ||
      JSON.stringify(response.data);

    return sock.sendMessage(
      message.key.remoteJid,
      { text: `🤖 ${answer}` },
      { quoted: message }
    );
  } catch (error) {
    console.error("AI error:", error.response?.data || error.message);
    return sock.sendMessage(
      message.key.remoteJid,
      { text: "❌ AI service se response nahi aa raha." },
      { quoted: message }
    );
  }
}

module.exports = { ai };
