#!/bin/bash
# Installerer alt til MacroPad'en: code.py + boot.py paa boardet og
# follow-tjenesten + makroer paa Mac'en.
#
# Koeres normalt via codeload-pakken (altid friske filer, ingen CDN-cache):
#   cd "$(mktemp -d)" && curl -fsSL https://codeload.github.com/TPixel/time-app/tar.gz/refs/heads/claude/rp2040-usb-connection-1ivgl9 | tar -xz && bash */macropad/install.sh
set -e

BASE_URL="https://raw.githubusercontent.com/TPixel/time-app/claude/rp2040-usb-connection-1ivgl9/macropad"
BOARD="/Volumes/CIRCUITPY"
MP_DIR="$HOME/.macropad"
PLIST="$HOME/Library/LaunchAgents/dk.ditzel.macropad.follow.plist"

# Lokal tilstand: ligger filerne ved siden af scriptet (codeload-pakke /
# git-checkout), bruges de direkte — ellers hentes fra GitHub raw (fallback).
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/code.py" ]; then
  echo "📦 Installerer fra lokal pakke ($SCRIPT_DIR)"
  hent() { cp "$SCRIPT_DIR/$1" "$2"; }
else
  echo "🌐 Henter fra GitHub (raw)"
  hent() { curl -fsSL "$BASE_URL/$1" -o "$2"; }
fi

if [ ! -d "$BOARD" ]; then
  echo "❌ Kan ikke finde CIRCUITPY-drevet ($BOARD)."
  echo "   Sæt MacroPad'en i USB og prøv igen."
  exit 1
fi

echo "⬇️  Skaffer nyeste filer ..."
hent code.py /tmp/macropad-code.py
hent boot.py /tmp/macropad-boot.py
hent macropad-follow.sh /tmp/macropad-follow.sh

echo "📋 Kopierer code.py til boardet ..."
cp /tmp/macropad-code.py "$BOARD/code.py"

RESET_NEEDED=0
if ! cmp -s /tmp/macropad-boot.py "$BOARD/boot.py" 2>/dev/null; then
  echo "📋 Kopierer boot.py til boardet (ny/ændret) ..."
  cp /tmp/macropad-boot.py "$BOARD/boot.py"
  RESET_NEEDED=1
fi
sync

echo "🛠  Installerer follow-tjenesten ..."
mkdir -p "$MP_DIR"
cp /tmp/macropad-follow.sh "$MP_DIR/macropad-follow.sh"
chmod +x "$MP_DIR/macropad-follow.sh"

echo "📜 Installerer AppleScript-makroer ..."
mkdir -p "$MP_DIR/scripts"
for script in pixelmator-300px workspace-1 workspace-2 keyboard-dk keyboard-eng; do
  hent "scripts/$script.applescript" "$MP_DIR/scripts/$script.applescript"
done

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dk.ditzel.macropad.follow</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$MP_DIR/macropad-follow.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$MP_DIR/follow.log</string>
    <key>StandardErrorPath</key>
    <string>$MP_DIR/follow.log</string>
</dict>
</plist>
PLIST_EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "✅ Færdig! Boardet genstarter selv med den nye kode."
if [ "$RESET_NEEDED" = "1" ]; then
  echo ""
  echo "⚠️  VIGTIGT: boot.py er ny — tag USB-stikket ud og ind ÉN gang"
  echo "   (eller tryk RESET på boardet), før app-følgning virker."
fi
