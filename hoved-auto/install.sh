#!/bin/bash
# Installerer automatisk "kør hoved" hver 2. time via launchd.
# Kør én gang på Mac'en:  bash hoved-auto/install.sh
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.ditzel.hoved.plist"
chmod +x "$DIR/hoved-auto.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.ditzel.hoved</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$DIR/hoved-auto.sh</string></array>
  <key>StartInterval</key><integer>7200</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/hoved-auto.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.ditzel.hoved" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✅ Installeret: 'kør hoved' kører nu automatisk hver 2. time."
echo "   Log:    ~/Library/Logs/hoved-auto.log"
echo "   Stop:   launchctl bootout gui/$(id -u)/com.ditzel.hoved"
echo "   Kør nu: launchctl kickstart gui/$(id -u)/com.ditzel.hoved"
