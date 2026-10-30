#!/bin/zsh
# Synk Mac'ens Kontakter → Hoved-adressebogen (hoved-bog.html).
# Kræver nøglefil ~/.config/hoved/noegle (samme nøgle som worker-secret KONTAKT_NOEGLE).
NOEGLE_FIL="$HOME/.config/hoved/noegle"
[ -f "$NOEGLE_FIL" ] || { echo "❌ Mangler $NOEGLE_FIL"; exit 1; }
NOEGLE=$(cat "$NOEGLE_FIL")
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "📇 Læser Kontakter-appen (kan tage et minut)…"
osascript "$(cd "$(dirname "$0")" && pwd)/synk-kontakter.applescript" > "$TMP/raa.txt" || { echo "❌ AppleScript fejlede"; exit 1; }
/usr/bin/python3 - "$TMP/raa.txt" "$TMP/kontakter.json" <<'PY'
import json,sys
raa=open(sys.argv[1],encoding='utf-8').read().strip()
ks=[]
for linje in raa.split('<<R>>'):
    f=linje.split('<<F>>')
    if len(f)<5: continue
    navn,firma,stil,tlf,em=(x.strip() for x in f[:5])
    if not (navn or firma or tlf): continue
    ks.append({'navn':navn or firma,'firma':firma,'stilling':stil,'telefon':tlf,'email':em,'adresse':''})
json.dump({'erstat':True,'kontakter':ks},open(sys.argv[2],'w'))
print('✅ fundet', len(ks), 'kontakter')
PY
curl -s -X POST "https://lightcrew-api.thomas-5c5.workers.dev/api/kontakter" \
  -H "Authorization: Bearer $NOEGLE" -H 'Content-Type: application/json' \
  --data-binary @"$TMP/kontakter.json"
echo
