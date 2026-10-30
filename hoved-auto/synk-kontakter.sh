#!/bin/zsh
# Synk Mac'ens Kontakter → Hoved-adressebogen (hoved-bog.html).
# Kræver nøglefil ~/.config/hoved/noegle (samme nøgle som worker-secret KONTAKT_NOEGLE).
# Auto-sorterer hver kontakt i grupper (familie/filmbranche/motorcykel/takeaway/restauranter):
# først med nøgleords-regler, derefter spørges claude CLI om resten (kun navn/firma/stilling sendes).
NOEGLE_FIL="$HOME/.config/hoved/noegle"
[ -f "$NOEGLE_FIL" ] || { echo "❌ Mangler $NOEGLE_FIL"; exit 1; }
NOEGLE=$(cat "$NOEGLE_FIL")
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "📇 Læser Kontakter-appen (kan tage et minut)…"
open -gja Contacts; sleep 3   # skal være startet, ellers fejler AppleScript med -600
osascript "$(cd "$(dirname "$0")" && pwd)/synk-kontakter.applescript" > "$TMP/raa.txt" || { echo "❌ AppleScript fejlede"; exit 1; }

# 1) Parse + regel-sortering. Uafklarede kontakter skrives til uafklaret.txt (nr<TAB>navn | firma | stilling).
/usr/bin/python3 - "$TMP/raa.txt" "$TMP/kontakter.json" "$TMP/uafklaret.txt" <<'PY'
import json,re,sys
raa=open(sys.argv[1],encoding='utf-8').read().strip()
REGLER={
 'familie':r'ditzel|\b(mor|far|mormor|farmor|morfar|farfar|moster|faster|onkel|tante|svigermor|svigerfar|kusine|fætter|bedste)\b',
 'filmbranche':r'film|\btv\b|\bdr\b|zentropa|nordisk|produktion|production|fotograf|instruktør|producer|gaffer|\bgrip\b|belysning|lysmester|kamera|scenograf|rekvisit|klipper|\blyd\b|tonemester|casting|stunt|location|runner|kostume|sminkør|makeup|studie|teater|scene',
 'motorcykel':r'motorcykel|\bmc\b|harley|davidson|yamaha|kawasaki|ducati|triumph|motorrad|moto\b|biker',
 'takeaway':r'pizza|pizzeria|sushi|kebab|shawarma|burger|grill(en|bar)?\b|\bthai\b|\bwok\b|takeaway|take away|durum|falafel',
 'restauranter':r'restaurant|café|cafe\b|bistro|brasserie|\bkro\b|spiseri|vinbar|gastropub|trattoria|osteria',
}
ks=[]; uafklaret=[]
for linje in raa.split('<<R>>'):
    f=linje.split('<<F>>')
    if len(f)<5: continue
    navn,firma,stil,tlf,em=(x.strip() for x in f[:5])
    if not (navn or firma or tlf): continue
    tekst=(navn+' '+firma+' '+stil).lower()
    grupper=[g for g,rx in REGLER.items() if re.search(rx,tekst)]
    k={'navn':navn or firma,'firma':firma,'stilling':stil,'telefon':tlf,'email':em,'adresse':'','gruppe':'|'.join(grupper)}
    if not grupper and (firma or stil):
        uafklaret.append(f"{len(ks)}\t{navn} | {firma} | {stil}")
    ks.append(k)
json.dump({'erstat':True,'kontakter':ks},open(sys.argv[2],'w'))
open(sys.argv[3],'w',encoding='utf-8').write('\n'.join(uafklaret))
print(f"✅ fundet {len(ks)} kontakter — regler sorterede {sum(1 for k in ks if k['gruppe'])}, claude spørges om {len(uafklaret)}")
PY

# 2) AI-sortering af resten via claude CLI (hvis den findes).
CLAUDE_BIN="$(/bin/zsh -lc 'command -v claude' 2>/dev/null | tail -1)"
if [ -z "$CLAUDE_BIN" ]; then
  for c in "$HOME/.claude/local/claude" "$HOME/.local/bin/claude" \
           /opt/homebrew/bin/claude /usr/local/bin/claude \
           "$HOME/.npm-global/bin/claude" "$HOME/Library/Application Support/Claude/claude"; do
    [ -x "$c" ] && CLAUDE_BIN="$c" && break
  done
fi
if [ -x "$CLAUDE_BIN" ] && [ -s "$TMP/uafklaret.txt" ]; then
  echo "🤖 Claude sorterer resten…"
  ANTAL=$(wc -l < "$TMP/uafklaret.txt" | tr -d ' ')
  : > "$TMP/svar.txt"
  split -l 100 "$TMP/uafklaret.txt" "$TMP/del_"
  for DEL in "$TMP"/del_*; do
    { echo "Her er kontakter fra en adressebog, én pr. linje: nr<TAB>navn | firma | stilling."
      echo "Sortér hver kontakt i PRÆCIS én af grupperne: familie, filmbranche, motorcykel, takeaway, restauranter — eller spring den over hvis ingen passer."
      echo "filmbranche = alt omkring film/tv/teater/lys/produktion. takeaway = steder man henter mad. restauranter = steder man spiser."
      echo "Svar KUN med linjer på formen 'nr: gruppe' for de kontakter der hører til en gruppe. Intet andet."
      echo; cat "$DEL"; } | "$CLAUDE_BIN" -p --model haiku >> "$TMP/svar.txt" 2>/dev/null
  done
  /usr/bin/python3 - "$TMP/kontakter.json" "$TMP/svar.txt" <<'PY'
import json,re,sys
d=json.load(open(sys.argv[1]))
gyldige={'familie','filmbranche','motorcykel','takeaway','restauranter'}
n=0
for m in re.finditer(r'^\s*(\d+)\s*:\s*(\w+)\s*$',open(sys.argv[2],encoding='utf-8').read(),re.M):
    i,g=int(m.group(1)),m.group(2).lower()
    if g in gyldige and 0<=i<len(d['kontakter']) and not d['kontakter'][i]['gruppe']:
        d['kontakter'][i]['gruppe']=g; n+=1
json.dump(d,open(sys.argv[1],'w'))
print(f"🤖 claude sorterede {n} mere")
PY
else
  [ -s "$TMP/uafklaret.txt" ] && echo "⚠️ claude CLI ikke fundet — springer AI-sortering over (regel-grupperne er stadig med)"
fi

# 3) Upload
curl -s -X POST "https://lightcrew-api.thomas-5c5.workers.dev/api/kontakter" \
  -H "Authorization: Bearer $NOEGLE" -H 'Content-Type: application/json' \
  --data-binary @"$TMP/kontakter.json"
echo
