#!/bin/bash
# Installerer alt til MacroPad'en: code.py + boot.py paa boardet og
# follow-tjenesten paa Mac'en (launchd). Koer paa Mac'en hvor boardet sidder i.
set -e

BASE_URL="https://raw.githubusercontent.com/TPixel/time-app/claude/rp2040-usb-connection-1ivgl9/macropad"
STAMP=$(date +%s)  # cache-buster: tvinger GitHubs CDN til at give nyeste version
BOARD="/Volumes/CIRCUITPY"
MP_DIR="$HOME/.macropad"
PLIST="$HOME/Library/LaunchAgents/dk.ditzel.macropad.follow.plist"

if [ ! -d "$BOARD" ]; then
  echo "❌ Kan ikke finde CIRCUITPY-drevet ($BOARD)."
  echo "   Sæt MacroPad'en i USB og prøv igen."
  exit 1
fi

echo "⬇️  Henter nyeste filer ..."
curl -fsSL "$BASE_URL/code.py?v=$STAMP" -o /tmp/macropad-code.py
curl -fsSL "$BASE_URL/boot.py?v=$STAMP" -o /tmp/macropad-boot.py
curl -fsSL "$BASE_URL/macropad-follow.sh?v=$STAMP" -o /tmp/macropad-follow.sh

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
  curl -fsSL "$BASE_URL/scripts/$script.applescript?v=$STAMP" -o "$MP_DIR/scripts/$script.applescript"
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
echo ""
echo "ℹ️  Første gang kan macOS spørge om lov til at styre 'System Events'"
echo "   — klik OK/Tillad, ellers kan tjenesten ikke se den aktive app."
