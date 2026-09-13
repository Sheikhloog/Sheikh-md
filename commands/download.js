const fs = require("fs");
const os = require("os");
const path = require("path");

const yts = require("yt-search");
const ytDlp = require("yt-dlp-exec");
const ffmpegPath = require("ffmpeg-static");

// ======================================================
// SETTINGS
// ======================================================

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60 MB
const DOWNLOAD_TIMEOUT = 180000; // 3 minutes

// ======================================================
// HELPERS
// ======================================================

function getTempDirectory() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "sheikh-md-")
  );

  return dir;
}

function cleanDirectory(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, {
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

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function isUrl(text = "") {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

async function resolveVideo(query) {
  if (isUrl(query)) {
    return {
      url: query.trim(),
      title: "Downloaded Media"
    };
  }

  const result = await yts(query);

  if (!result || !result.videos || !result.videos.length) {
    throw new Error("Song/video nahi mila.");
  }

  const firstVideo = result.videos[0];

  return {
    url: firstVideo.url,
    title: firstVideo.title
  };
}

function validateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Downloaded file create nahi hui.");
  }

  const size = getFileSize(filePath);

  if (!size) {
    throw new Error("Downloaded file empty hai.");
  }

  if (size > MAX_FILE_SIZE) {
    throw new Error(
      "File 60MB se zyada hai. Chhota song/video try karo."
    );
  }

  return size;
}

// ======================================================
// MP3 DOWNLOAD
// ======================================================

async function downloadAudio({ sock, message, rawArgs, config }) {
  const query = String(rawArgs || "").trim();

  if (!query) {
    return sendText(
      sock,
      message,
      `❌ Usage: ${config.prefix}song <song name/link>`
    );
  }

  const tempDir = getTempDirectory();
  const outputPath = path.join(tempDir, "audio.mp3");

  try {
    await sendText(
      sock,
      message,
      "⏳ Song search/download ho raha hai...\nPlease wait."
    );

    const video = await resolveVideo(query);

    await ytDlp(video.url, {
      output: outputPath,
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: "5",
      ffmpegLocation: ffmpegPath,
      noPlaylist: true,
      noWarnings: true,
      quiet: true,
      socketTimeout: 30000
    }, {
      timeout: DOWNLOAD_TIMEOUT
    });

    validateFile(outputPath);

    await sock.sendMessage(
      message.key.remoteJid,
      {
        audio: {
          url: outputPath
        },
        mimetype: "audio/mpeg",
        fileName: `${video.title.slice(0, 60)}.mp3`,
        ptt: false
      },
      {
        quoted: message
      }
    );

    console.log(`✅ MP3 sent: ${video.title}`);
  } catch (error) {
    console.error(
      "❌ Audio download error:",
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
// MP4 DOWNLOAD
// ======================================================

async function downloadVideo({ sock, message, rawArgs, config }) {
  const query = String(rawArgs || "").trim();

  if (!query) {
    return sendText(
      sock,
      message,
      `❌ Usage: ${config.prefix}video <video name/link>`
    );
  }

  const tempDir = getTempDirectory();
  const outputPath = path.join(tempDir, "video.mp4");

  try {
    await sendText(
      sock,
      message,
      "⏳ Video search/download ho raha hai...\nPlease wait."
    );

    const video = await resolveVideo(query);

    await ytDlp(video.url, {
      output: outputPath,
      format:
        "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b",
      mergeOutputFormat: "mp4",
      ffmpegLocation: ffmpegPath,
      noPlaylist: true,
      noWarnings: true,
      quiet: true,
      socketTimeout: 30000
    }, {
      timeout: DOWNLOAD_TIMEOUT
    });

    validateFile(outputPath);

    await sock.sendMessage(
      message.key.remoteJid,
      {
        video: {
          url: outputPath
        },
        mimetype: "video/mp4",
        fileName: `${video.title.slice(0, 50)}.mp4`,
        caption: `🎬 ${video.title}`
      },
      {
        quoted: message
      }
    );

    console.log(`✅ MP4 sent: ${video.title}`);
  } catch (error) {
    console.error(
      "❌ Video download error:",
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
