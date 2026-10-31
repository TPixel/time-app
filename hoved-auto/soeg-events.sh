#!/bin/zsh
# 🎭 Søg events til hoved-bogens Event-side (TPixel/apps#5).
# Henter de fulgte (bands/spillesteder/museer/restauranter/popups) fra /api/foelger,
# beder claude CLI søge nettet efter kommende events pr. fulgt, og POSTer fundene
# til /api/events — workeren dedupper på titel+dato+sted, så scriptet kan køres igen og igen.
# Kør manuelt: ./soeg-events.sh   (endnu ikke koblet på launchd)
API="https://lightcrew-api.thomas-5c5.workers.dev"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
IDAG=$(date +%F)

curl -s "$API/api/foelger" > "$TMP/foelger.json" || { echo "❌ Kunne ikke hente de fulgte"; exit 1; }
ANTAL=$(/usr/bin/python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$TMP/foelger.json" 2>/dev/null)
[ -z "$ANTAL" ] && { echo "❌ Uventet svar fra /api/foelger"; cat "$TMP/foelger.json"; exit 1; }
[ "$ANTAL" = "0" ] && { echo "Følger ingen endnu — tilføj på Event-siden i bogen"; exit 0; }
echo "🎭 Søger events for $ANTAL fulgte (i dag: $IDAG)…"

# claude CLI (samme søgemønster som synk-kontakter.sh)
CLAUDE_BIN="$(/bin/zsh -lc 'command -v claude' 2>/dev/null | tail -1)"
if [ -z "$CLAUDE_BIN" ]; then
  for c in "$HOME/.claude/local/claude" "$HOME/.local/bin/claude" \
           /opt/homebrew/bin/claude /usr/local/bin/claude \
           "$HOME/.npm-global/bin/claude" "$HOME/Library/Application Support/Claude/claude"; do
    [ -x "$c" ] && CLAUDE_BIN="$c" && break
  done
fi
[ -x "$CLAUDE_BIN" ] || { echo "❌ claude CLI ikke fundet"; exit 1; }

/usr/bin/python3 -c '
import json,sys
for f in json.load(open(sys.argv[1])):
    print(str(f["id"])+"\t"+f["type"]+"\t"+f["navn"])
' "$TMP/foelger.json" > "$TMP/liste.tsv"

while IFS=$'\t' read -r FID FTYPE FNAVN; do
  echo "— $FNAVN ($FTYPE)…"
  { echo "Søg på nettet efter KOMMENDE events for \"$FNAVN\" ($FTYPE, Danmark). I dag er $IDAG."
    echo "band → kommende koncerter/turnédatoer. spillested → programmet/plakaten de næste par måneder."
    echo "museum → udstillinger: brug åbningsdatoen hvis den er fremtidig, ellers udstillingens slutdato."
    echo "restaurant/popup → særlige arrangementer, popup-datoer, events."
    echo "Svar KUN med et JSON-array, ingen markdown og ingen forklaring, på formen:"
    echo '[{"titel":"…","sted":"…","dato":"ÅÅÅÅ-MM-DD","url":"…","kilde":"…"}]'
    echo "Højst 8 events, kun dato >= $IDAG, kun events du faktisk fandt på nettet (gæt aldrig datoer)."
    echo "kilde = sitet du fandt det på (fx vega.dk). Tomt array [] hvis intet findes."
  } | "$CLAUDE_BIN" -p --model sonnet --allowedTools "WebSearch,WebFetch" > "$TMP/svar.txt" 2>/dev/null

  /usr/bin/python3 - "$TMP/svar.txt" "$FID" "$IDAG" > "$TMP/post.json" <<'PY'
import json,re,sys
raa=open(sys.argv[1],encoding='utf-8').read()
m=re.search(r'\[.*\]',raa,re.S)
evs=[]
if m:
    try: evs=json.loads(m.group(0))
    except Exception: evs=[]
ud=[]
for e in evs:
    if not isinstance(e,dict): continue
    dato=str(e.get('dato','')).strip()
    if not e.get('titel') or not re.match(r'^\d{4}-\d{2}-\d{2}$',dato) or dato<sys.argv[3]: continue
    ud.append({'titel':str(e['titel']).strip(),'sted':str(e.get('sted','')).strip(),'dato':dato,
               'url':str(e.get('url','')).strip(),'kilde':str(e.get('kilde','')).strip(),
               'foelger_id':int(sys.argv[2])})
json.dump({'events':ud},sys.stdout)
print('\n  fundet: '+str(len(ud)),file=sys.stderr)
PY

  SVAR=$(curl -s -X POST "$API/api/events" -H 'Content-Type: application/json' --data-binary @"$TMP/post.json")
  echo "  → $SVAR"
done < "$TMP/liste.tsv"
echo "✅ Færdig — se fanen 🎭 Events i bogen"
