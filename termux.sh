#!/data/data/com.termux/files/usr/bin/bash
set -e

pkg update -y
pkg upgrade -y
pkg install nodejs git -y

npm install
echo "Setup complete. Run: npm start"