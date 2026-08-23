#!/bin/bash
# Installerer nyeste code.py på MacroPad'en (CIRCUITPY-drevet) — kør på Mac'en hvor boardet sidder i.
set -e

RAW_URL="https://raw.githubusercontent.com/TPixel/time-app/claude/rp2040-usb-connection-1ivgl9/macropad/code.py"
BOARD="/Volumes/CIRCUITPY"

if [ ! -d "$BOARD" ]; then
  echo "❌ Kan ikke finde CIRCUITPY-drevet ($BOARD)."
  echo "   Sæt MacroPad'en i USB og prøv igen."
  echo "   (Dukker det stadig ikke op: dobbelttryk RESET og se om der kommer et RPI-RP2-drev — så mangler CircuitPython.)"
  exit 1
fi

echo "⬇️  Henter nyeste code.py ..."
curl -fsSL "$RAW_URL" -o /tmp/macropad-code.py

echo "📋 Kopierer til $BOARD/code.py ..."
cp /tmp/macropad-code.py "$BOARD/code.py"
sync

echo "✅ Færdig! Boardet genstarter selv med den nye kode om et par sekunder."
