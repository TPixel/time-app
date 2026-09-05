#!/bin/bash
# Kører "kør hoved" headless i Claude Code — kaldes af launchd (se install.sh).
# Log: ~/Library/Logs/hoved-auto.log

set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/hoved-auto.log"
LOCK="/tmp/hoved-auto.lock"

# launchd har minimal PATH — find claude-CLI'en
export PATH="$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v claude >/dev/null 2>&1 || { echo "$(date '+%F %T') claude CLI ikke fundet i PATH" >> "$LOG"; exit 1; }

# undgå overlappende kørsler
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') springer over — kører allerede" >> "$LOG"; exit 0
fi
trap 'rmdir "$LOCK"' EXIT

{
  echo "=== $(date '+%F %T') kør hoved ==="
  cd "$REPO" && claude -p "kør hoved" \
    --allowedTools "Skill" "Read" "WebSearch" "WebFetch" \
      "Bash(curl:*)" "Bash(osascript:*)" "Bash(gh:*)" \
    --max-turns 60
  echo "=== $(date '+%F %T') færdig (exit $?) ==="
} >> "$LOG" 2>&1
