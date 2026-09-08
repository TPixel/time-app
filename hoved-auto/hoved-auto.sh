#!/bin/bash
# Kører "kør hoved" headless i Claude Code — kaldes af launchd (se install.sh).
# Log: ~/Library/Logs/hoved-auto.log

set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/hoved-auto.log"
LOCK="/tmp/hoved-auto.lock"

# launchd har minimal PATH — spørg en login-shell (samme PATH som Terminal)
CLAUDE_BIN="$(/bin/zsh -lc 'command -v claude' 2>/dev/null | tail -1)"
if [ -z "$CLAUDE_BIN" ]; then
  for c in "$HOME/.claude/local/claude" "$HOME/.local/bin/claude" \
           /opt/homebrew/bin/claude /usr/local/bin/claude \
           "$HOME/.npm-global/bin/claude" "$HOME/Library/Application Support/Claude/claude"; do
    [ -x "$c" ] && CLAUDE_BIN="$c" && break
  done
fi
if [ -z "$CLAUDE_BIN" ]; then
  echo "$(date '+%F %T') claude CLI ikke fundet — kør 'which claude' i Terminal; er den tom, installér CLI'en (npm install -g @anthropic-ai/claude-code)" >> "$LOG"
  exit 1
fi

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
