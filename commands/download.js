const fs = require("fs");
const os = require("os");
const path = require("path");

const yts = require("yt-search");
const ytDlp = require("youtube-dl-exec");
const ffmpegPath = require("ffmpeg-static");

// ======================================================
// SETTINGS
// ======================================================

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60 MB
const DOWNLOAD_TIMEOUT = 180000; // 3 minutes
const SELECTION_EXPIRE_TIME = 10 * 60 * 1000; // 10 minutes

// Menu message ID => selected media information
const pendingSelections = new Map();

// ======================================================
// TEMP FILE HELPERS
// ======================================================

function createTempDirectory() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "sheikh-md-")
  );
}

function cleanDirectory(directory) {
  try {
    if (directory && fs.existsSync(directory)) {
      fs.rmSync(directory, {
        recursive: true,
        force: true
      });
    }
  } catch (error) {
    console.error(
      "❌ Temp cleanup error:",
      error?.message || error
    );
  }
}

// ======================================================
// WHATSAPP HELPERS
// ======================================================

async function sendText(sock, message, text) {
  return sock.sendMessage(
    message.key.remoteJid,
    {
      text
    },
    {
      quoted: message
    }
  );
}

function getChatId(message) {
  return message.key?.remoteJid || "";
}

function getQuotedMessageId(message) {
  return (
    message.message?.extendedTextMessage?.contextInfo
      ?.stanzaId || ""
  );
}

function getMessageText(message) {
  const msg = message.message || {};

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ""
  ).trim();
}

// ======================================================
// FILE HELPERS
// ======================================================

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function validateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Downloaded file create nahi hui.");
  }

  const size = getFileSize(filePath);

  if (size <= 0) {
    throw new Error("Downloaded file empty hai.");
  }

  if (size > MAX_FILE_SIZE) {
    throw new Error(
      "File 60MB se zyada hai. Chhota media select karo."
    );
  }

  return size;
}

function safeFileName(name = "media") {
  return (
    String(name)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "media"
  );
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";

  const mb = bytes / (1024 * 1024);

  if (mb < 1) {
    return `${Math.round(bytes / 1024)}KB`;
  }

  return `${mb.toFixed(1)}MB`;
}

// Approximate audio size:
// bitrate(kbps) × duration(seconds) ÷ 8
function estimateAudioSize(durationSeconds, bitrate) {
  if (!durationSeconds) return 0;

  return durationSeconds * (bitrate * 1000 / 8);
}

// Approximate video size using average bitrate.
// Actual size can differ depending on video.
function estimateVideoSize(durationSeconds, bitrateMbps) {
  if (!durationSeconds) return 0;

  return durationSeconds * bitrateMbps * 1000 * 1000 / 8;
}

// ======================================================
// SEARCH
// ======================================================

function isUrl(text = "") {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

async function searchMedia(query) {
  if (isUrl(query)) {
    const result = await yts(query);

    if (result?.videos?.length) {
      const video = result.videos[0];

      return {
        url: video.url,
        title: video.title || "Downloaded Media",
        thumbnail: video.thumbnail || null,
        durationSeconds: video.seconds || 0,
        duration: video.timestamp || "Unknown"
      };
    }

    return {
      url: query,
      title: "Downloaded Media",
      thumbnail: null,
      durationSeconds: 0,
      duration: "Unknown"
    };
  }

  const result = await yts(query);

  if (
    !result ||
    !Array.isArray(result.videos) ||
    result.videos.length === 0
  ) {
    throw new Error("Song/video nahi mila.");
  }

  const video = result.videos[0];

  return {
    url: video.url,
    title: video.title || "Downloaded Media",
    thumbnail: video.thumbnail || null,
    durationSeconds: video.seconds || 0,
    duration: video.timestamp || "Unknown"
  };
}

// ======================================================
// SEND QUALITY MENU
// ======================================================

async function sendQualityMenu(sock, message, media) {
  const duration = media.durationSeconds;

  const audio144 = estimateAudioSize(duration, 144);
  const audio256 = estimateAudioSize(duration, 256);
  const video720 = estimateVideoSize(duration, 2.2);

  const caption = `╭━━━〔 🎵 SHEIKH-MD MEDIA 〕━━━╮
┃
┃ 🎶 Title: ${media.title}
┃ ⏱ Duration: ${media.duration}
┃
┣━━〔 DOWNLOAD OPTIONS 〕
┃
┃ 1️⃣ MP3 144kbps
┃    Approx Size: ${formatSize(audio144)}
┃
┃ 2️⃣ MP3 256kbps
┃    Approx Size: ${formatSize(audio256)}
┃
┃ 3️⃣ MP4 720p
┃    Approx Size: ${formatSize(video720)}
┃
┣━━━━━━━━━━━━━━━━━━
┃
┃ Reply to this message
┃ with 1, 2 or 3.
┃
╰━━━━━━━━━━━━━━━━━━╯`;

  let sentMessage;

  if (media.thumbnail) {
    sentMessage = await sock.sendMessage(
      message.key.remoteJid,
      {
        image: {
          url: media.thumbnail
        },
        caption
      },
      {
        quoted: message
      }
    );
  } else {
    sentMessage = await sock.sendMessage(
      message.key.remoteJid,
      {
        text: caption
      },
      {
        quoted: message
      }
    );
  }

  const menuMessageId = sentMessage?.key?.id;

  if (menuMessageId) {
    pendingSelections.set(menuMessageId, {
      chatId: getChatId(message),
      url: media.url,
      title: media.title,
      createdAt: Date.now()
    });

    setTimeout(() => {
      pendingSelections.delete(menuMessageId);
    }, SELECTION_EXPIRE_TIME);
  }

  return sentMessage;
}

// ======================================================
// FIRST COMMAND: .song
// ======================================================

async function song({ sock, message, rawArgs, config }) {
  const query = String(rawArgs || "").trim();

  if (!query) {
    return sendText(
      sock,
      message,
      `❌ Usage: ${config.prefix}song <song name/link>\n\nExample:\n${config.prefix}song Tary Lia`
    );
  }

  try {
    await sendText(
      sock,
      message,
      "🔎 Song search ho raha hai..."
    );

    const media = await searchMedia(query);

    return sendQualityMenu(sock, message, media);
  } catch (error) {
    console.error(
      "❌ Search error:",
      error?.stack || error
    );

    return sendText(
      sock,
      message,
      `❌ Song search failed.\n\nReason: ${
        error?.message || "Unknown error"
      }`
    );
  }
}

// ======================================================
// DOWNLOAD SELECTED AUDIO
// ======================================================

async function downloadSelectedAudio({
  sock,
  message,
  selection,
  bitrate
}) {
  const tempDir = createTempDirectory();
  const outputPath = path.join(
    tempDir,
    "audio.%(ext)s"
  );

  try {
    await sendText(
      sock,
      message,
      `⏳ MP3 ${bitrate}kbps download ho raha hai...`
    );

    await ytDlp(
      selection.url,
      {
        output: outputPath,
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: bitrate === 256 ? "0" : "5",
        ffmpegLocation: ffmpegPath,
        noPlaylist: true,
        noWarnings: true,
        quiet: true,
        retries: 2,
        socketTimeout: 30000
      },
      {
        timeout: DOWNLOAD_TIMEOUT
      }
    );

    const finalPath = path.join(
      tempDir,
      "audio.mp3"
    );

    validateFile(finalPath);

    await sock.sendMessage(
      message.key.remoteJid,
      {
        audio: {
          url: finalPath
        },
        mimetype: "audio/mpeg",
        fileName: `${safeFileName(selection.title)}.mp3`,
        ptt: false
      },
      {
        quoted: message
      }
    );

    console.log(
      `✅ MP3 ${bitrate}kbps sent: ${selection.title}`
    );
  } catch (error) {
    console.error(
      "❌ Audio download error:",
      error?.stack || error
    );

    await sendText(
      sock,
      message,
      `❌ MP3 download failed.\n\nYouTube ne download request block ki hai ya format available nahi hai.`
    );
  } finally {
    cleanDirectory(tempDir);
  }
}

// ======================================================
// DOWNLOAD SELECTED VIDEO
// ======================================================

async function downloadSelectedVideo({
  sock,
  message,
  selection
}) {
  const tempDir = createTempDirectory();
  const outputPath = path.join(
    tempDir,
    "video.%(ext)s"
  );

  try {
    await sendText(
      sock,
      message,
      "⏳ MP4 720p download ho raha hai..."
    );

    await ytDlp(
      selection.url,
      {
        output: outputPath,
        format:
          "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]",
        mergeOutputFormat: "mp4",
        ffmpegLocation: ffmpegPath,
        noPlaylist: true,
        noWarnings: true,
        quiet: true,
        retries: 2,
        socketTimeout: 30000
      },
      {
        timeout: DOWNLOAD_TIMEOUT
      }
    );

    const finalPath = path.join(
      tempDir,
      "video.mp4"
    );

    validateFile(finalPath);

    await sock.sendMessage(
      message.key.remoteJid,
      {
        video: {
          url: finalPath
        },
        mimetype: "video/mp4",
        fileName: `${safeFileName(selection.title)}.mp4`,
        caption: `🎬 ${selection.title}`
      },
      {
        quoted: message
      }
    );

    console.log(
      `✅ MP4 720p sent: ${selection.title}`
    );
  } catch (error) {
    console.error(
      "❌ Video download error:",
      error?.stack || error
    );

    await sendText(
      sock,
      message,
      "❌ MP4 download failed.\n\nYouTube ne download request block ki hai ya video format available nahi hai."
    );
  } finally {
    cleanDirectory(tempDir);
  }
}

// ======================================================
// HANDLE REPLY: 1 / 2 / 3
// ======================================================

async function handleSelection(sock, message) {
  if (!message?.message) return false;

  const text = getMessageText(message);

  if (!["1", "2", "3"].includes(text)) {
    return false;
  }

  const quotedId = getQuotedMessageId(message);

  if (!quotedId) {
    return false;
  }

  const selection = pendingSelections.get(quotedId);

  if (!selection) {
    return false;
  }

  if (
    selection.chatId !== getChatId(message)
  ) {
    return false;
  }

  pendingSelections.delete(quotedId);

  if (text === "1") {
    await downloadSelectedAudio({
      sock,
      message,
      selection,
      bitrate: 144
    });

    return true;
  }

  if (text === "2") {
    await downloadSelectedAudio({
      sock,
      message,
      selection,
      bitrate: 256
    });

    return true;
  }

  if (text === "3") {
    await downloadSelectedVideo({
      sock,
      message,
      selection
    });

    return true;
  }

  return false;
}

// ======================================================
// COMMAND ALIASES
// ======================================================

module.exports = {
  song,
  mp3: song,
  video: song,
  mp4: song,
  handleSelection
};
