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
const MAX_TITLE_LENGTH = 60;

// ======================================================
// TEMP DIRECTORY
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

async function sendAudio(
  sock,
  message,
  filePath,
  title
) {
  return sock.sendMessage(
    message.key.remoteJid,
    {
      audio: {
        url: filePath
      },
      mimetype: "audio/mpeg",
      fileName: `${safeFileName(title)}.mp3`,
      ptt: false
    },
    {
      quoted: message
    }
  );
}

async function sendVideo(
  sock,
  message,
  filePath,
  title
) {
  return sock.sendMessage(
    message.key.remoteJid,
    {
      video: {
        url: filePath
      },
      mimetype: "video/mp4",
      fileName: `${safeFileName(title)}.mp4`,
      caption: `🎬 ${title}`
    },
    {
      quoted: message
    }
  );
}

// ======================================================
// FILE HELPERS
// ======================================================

function safeFileName(name = "media") {
  return String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH) || "media";
}

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
      "File 60MB se zyada hai. Chhota media try karo."
    );
  }

  return size;
}

// ======================================================
// URL / SEARCH
// ======================================================

function isUrl(text = "") {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

async function resolveMedia(query) {
  if (isUrl(query)) {
    return {
      url: query.trim(),
      title: "Downloaded Media"
    };
  }

  const searchResult = await yts(query);

  if (
    !searchResult ||
    !Array.isArray(searchResult.videos) ||
    searchResult.videos.length === 0
  ) {
    throw new Error("Song/video nahi mila.");
  }

  const firstResult = searchResult.videos[0];

  return {
    url: firstResult.url,
    title: firstResult.title || "Downloaded Media"
  };
}

// ======================================================
// COMMON YT-DLP OPTIONS
// ======================================================

function commonOptions(outputPath) {
  return {
    output: outputPath,
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    socketTimeout: 30000,
    retries: 2,
    ffmpegLocation: ffmpegPath
  };
}

// ======================================================
// MP3 / SONG
// ======================================================

async function downloadAudio({
  sock,
  message,
  rawArgs,
  config
}) {
  const query = String(rawArgs || "").trim();

  if (!query) {
    return sendText(
      sock,
      message,
      `❌ Usage: ${config.prefix}song <song name/link>\n\nExample:\n${config.prefix}song Believer Imagine Dragons`
    );
  }

  const tempDir = createTempDirectory();
  const outputPath = path.join(tempDir, "audio.%(ext)s");

  try {
    await sendText(
      sock,
      message,
      "⏳ Song search/download ho raha hai...\nPlease wait."
    );

    const media = await resolveMedia(query);

    await ytDlp(
      media.url,
      {
        ...commonOptions(outputPath),
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: "5"
      },
      {
        timeout: DOWNLOAD_TIMEOUT
      }
    );

    const finalAudioPath = path.join(tempDir, "audio.mp3");

    validateFile(finalAudioPath);

    await sendAudio(
      sock,
      message,
      finalAudioPath,
      media.title
    );

    console.log(`✅ MP3 sent: ${media.title}`);
  } catch (error) {
    console.error(
      "❌ MP3 download error:",
      error?.stack || error
    );

    await sendText(
      sock,
      message,
      `❌ MP3 download failed.\n\nReason: ${
        error?.message || "Unknown error"
      }`
    );
  } finally {
    cleanDirectory(tempDir);
  }
}

// ======================================================
// MP4 / VIDEO
// ======================================================

async function downloadVideo({
  sock,
  message,
  rawArgs,
  config
}) {
  const query = String(rawArgs || "").trim();

  if (!query) {
    return sendText(
      sock,
      message,
      `❌ Usage: ${config.prefix}video <video name/link>\n\nExample:\n${config.prefix}video funny cat video`
    );
  }

  const tempDir = createTempDirectory();
  const outputPath = path.join(tempDir, "video.%(ext)s");

  try {
    await sendText(
      sock,
      message,
      "⏳ Video search/download ho raha hai...\nPlease wait."
    );

    const media = await resolveMedia(query);

    await ytDlp(
      media.url,
      {
        ...commonOptions(outputPath),
        format:
          "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b",
        mergeOutputFormat: "mp4"
      },
      {
        timeout: DOWNLOAD_TIMEOUT
      }
    );

    const finalVideoPath = path.join(tempDir, "video.mp4");

    validateFile(finalVideoPath);

    await sendVideo(
      sock,
      message,
      finalVideoPath,
      media.title
    );

    console.log(`✅ MP4 sent: ${media.title}`);
  } catch (error) {
    console.error(
      "❌ MP4 download error:",
      error?.stack || error
    );

    await sendText(
      sock,
      message,
      `❌ MP4 download failed.\n\nReason: ${
        error?.message || "Unknown error"
      }`
    );
  } finally {
    cleanDirectory(tempDir);
  }
}

// ======================================================
// COMMAND ALIASES
// ======================================================

module.exports = {
  song: downloadAudio,
  mp3: downloadAudio,
  video: downloadVideo,
  mp4: downloadVideo
};
