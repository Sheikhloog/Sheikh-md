# SHEIKH-MD WhatsApp Bot

SHEIKH-MD is a modular WhatsApp bot built with Node.js and Baileys.

## Features

- QR login
- Pairing code login
- Menu and help
- Ping, alive, runtime, owner, bot info
- Group info, admins, tagall, hidetag, group link
- Kick, add, promote, demote
- Image to sticker
- Optional AI API integration
- Docker support
- Render/Railway deployment files
- VPS, Termux and local deployment support

## 1. Install locally

Use Node.js 20 or newer.

```bash
git clone YOUR_GITHUB_REPO_URL
cd SHEIKH-MD
npm install
cp .env.example .env
```

Edit `.env`:

```env
BOT_NAME=SHEIKH-MD
OWNER_NAME=Sheikh
OWNER_NUMBER=923XXXXXXXXX
PREFIX=.
SESSION_NAME=sheikh-md
CONNECTION_METHOD=both
PAIRING_NUMBER=923XXXXXXXXX
BOT_MODE=public
```

Start:

```bash
npm start
```

## 2. Login methods

### QR

Set:

```env
CONNECTION_METHOD=qr
```

Run `npm start`, then scan the QR from WhatsApp:

WhatsApp > Settings > Linked devices > Link a device

### Pairing code

Set:

```env
CONNECTION_METHOD=pairing
PAIRING_NUMBER=923XXXXXXXXX
```

The number must be digits only, with country code and without `+`.

Example:

```env
PAIRING_NUMBER=923001234567
```

Run:

```bash
npm start
```

Enter the displayed pairing code in:

WhatsApp > Settings > Linked devices > Link a device > Link with phone number

### Both

```env
CONNECTION_METHOD=both
```

For hosted services, QR is usually easier because terminal pairing input may not be available.

## 3. Commands

Default prefix is `.`.

### General

- `.menu`
- `.help`
- `.ping`
- `.alive`
- `.runtime`
- `.owner`
- `.botinfo`
- `.echo hello`

### Groups

- `.groupinfo`
- `.admins`
- `.tagall`
- `.hidetag announcement`
- `.link`

### Moderation

- `.kick @user`
- `.add 923xxxxxxxxx`
- `.promote @user`
- `.demote @user`

### Tools

- Reply to an image with `.sticker`
- `.ai your question` if AI API is configured

## 4. Deploy on VPS - recommended

A VPS is the most reliable option for a 24/7 WhatsApp bot because sessions can be stored permanently.

```bash
sudo apt update -y
sudo apt install -y git nodejs npm
git clone YOUR_GITHUB_REPO_URL
cd SHEIKH-MD
npm install
cp .env.example .env
nano .env
npm start
```

For 24/7 operation with PM2:

```bash
sudo npm install -g pm2
pm2 start index.js --name sheikh-md
pm2 save
pm2 startup
```

Follow the command PM2 prints.

## 5. Deploy with Docker

```bash
cp .env.example .env
nano .env
docker compose up -d --build
docker compose logs -f
```

The `sessions` folder is mounted so the login session persists.

## 6. Render

Render can run the bot, but free services may sleep and their filesystem is not suitable for permanent WhatsApp sessions. Use a persistent disk or another external session-storage strategy for production.

1. Push this project to GitHub.
2. Create a new Web Service on Render.
3. Select your repository.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add the variables from `.env`.
7. Prefer `CONNECTION_METHOD=qr`.

## 7. Railway

1. Push the project to GitHub.
2. Create a Railway project.
3. Deploy from GitHub.
4. Add environment variables from `.env`.
5. Set start command to `npm start`.
6. Use persistent storage if available, otherwise the session can be lost after redeploy/restart.

## 8. Termux

```bash
pkg update -y
pkg install nodejs git -y
git clone YOUR_GITHUB_REPO_URL
cd SHEIKH-MD
npm install
cp .env.example .env
nano .env
npm start
```

Keep Termux active for the bot to remain online. For Android background reliability, use a VPS instead.

## Important security notes

- Never upload `.env` or the `sessions` folder to GitHub.
- Never share your QR code or pairing code.
- If your WhatsApp account logs out, delete the local `sessions/<SESSION_NAME>` folder and pair again.
- This is a starter bot. Add rate limits, anti-spam, database storage, welcome messages, anti-link and downloader APIs separately.
