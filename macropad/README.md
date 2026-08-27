# MacroPad RP2040 — Mac Shortcut Keyboard

CircuitPython-kode til Adafruit MacroPad RP2040. Boardet fungerer som USB-tastatur
med 6 sider af genveje til Mac'en. Displayet viser alle 12 knappers funktion i et grid.

## v6.0: Boardet følger den aktive app

- En lille **follow-tjeneste** på Mac'en (installeres automatisk af install.sh som launchd-baggrundsproces) fortæller boardet over USB-seriel, hvilken app der er forrest — og boardet skifter selv side: **SAFARI**, **CHROME**, **PIXELM** (Pixelmator Pro), alt andet → **SYSTEM**. Ingen apps startes ved sideskift.
- Boardet kan bede Mac'en om ting via samme kanal — elegant, uden Spotlight: `open:App` åbner en app med `open -a`, `run:Navn` kører en Apple Genvej ved navn (`shortcuts run`). Uden tjenesten falder app-åbning tilbage til Spotlight.
- Encoder: drej = skift side manuelt, tryk = tilbage til SYSTEM
- Knap 1 = øverste venstre hjørne … knap 12 = nederste højre hjørne (samme plads i displayets grid)
- Alle knapper har to funktioner: **tryk** (kort) og **hold** (over 0,4 sek)
- **Globale holds:** knap 12 hold = MUTE · knap 10 hold = åbn Lommeregner + NUMPAD til/fra
- Apple Genveje: enten `genvej(...)` (hyper-tastaturgenvej: åbn genvejen i Genveje-appen → (i) → "Tilføj tastaturgenvej" → tryk på MacroPad-knappen) eller `("RUN", "Genvejens navn")` direkte ved navn
- **Efter første installation:** tag USB-stikket ud og ind én gang (boot.py aktiverer den serielle dataport), og godkend macOS-prompten om at styre "System Events"

### Filer på Mac'en

- `~/.macropad/macropad-follow.sh` — follow-tjenesten (log: `~/.macropad/follow.log`)
- `~/Library/LaunchAgents/dk.ditzel.macropad.follow.plist` — starter tjenesten automatisk ved login

## Installér på boardet (én kommando)

Sæt MacroPad'en i USB på din Mac og kør i Terminal:

```bash
cd "$(mktemp -d)" && curl -fsSL https://codeload.github.com/TPixel/time-app/tar.gz/refs/heads/claude/rp2040-usb-connection-1ivgl9 | tar -xz && bash */macropad/install.sh
```

Kommandoen henter hele pakken som et frisk øjebliksbillede af nyeste commit
(codeload cacher aldrig — GitHubs raw-CDN kunne finde på at servere 5 min gamle
filer) og installerer board-kode, follow-tjeneste og makroer. Boardet genstarter
selv. Samme kommando bruges hver gang koden er blevet opdateret.

## Betjening

- **Indbygget encoder (øverst):** drej = **zoom** ind/ud (⌘+ / ⌘−) i den aktive app · **hold nede + drej** = skift side manuelt · klik = tilbage til SYSTEM (siderne følger ellers selv den aktive app)
- **Regel:** knap-labels er altid max 7 tegn, når alle knapper er i brug
- **Stemma QT encoder:** drej = lydstyrke op/ned, tryk = mute
- **Displayet** viser sidens navn øverst og alle 12 knappers funktion i 3×4-grid (samme layout som tasterne)

## SYSTEM-siden (tryk / hold)

| | | |
|---|---|---|
| 1 Spotlight / Emoji | 2 Skærmbillede / Skærmoptag | 3 Mission Control / Lås skærm |
| 4 Kopiér / Klip | 5 Sæt ind / Sæt ind uden format | 6 Fortryd / Gentag |
| 7 Skjul app / Tving luk | 8 Luk vindue / Luk app | 9 Genvej1 / Genvej2 |
| 10 Lommeregner / **NUMPAD** | 11 Vol− / Play-pause | 12 Vol+ / **MUTE** |

## NUMPAD (hold knap 10)

7-8-9 / 4-5-6 / 1-2-3 øverst; nederst 0, komma og = (enter).
Hold: 9 = plus, 6 = minus, 3 = gange, komma = division, 7 = C (ryd). Hold knap 10 = tilbage.

## App-siderne (tryk / hold)

- **SAFARI / CHROME:** ny/luk/genåbn tab, privat/inkognito, skift tab, reload (Chrome: hard reload på hold), frem/tilbage, adressefelt (hold: søg på siden), bogmærke, hentninger — Chrome har desuden DevTools på knap 11 (hold: Inspektør-vælger)
- **PIXELM:** Ny/Åbn, Gem/Gem som, Eksportér, zoom ind/ud/tilpas, værktøjerne Crop (C), Vælg (V) og Tekst (T), fortryd/gentag, kopiér/sæt ind, slet

## Tilpasning

Siderne ligger i `PAGES`-listen i `code.py` — hver side har navn, `app` (åbnes ved sideskift), farve og 12 taster.
En genvej er en liste af trin: Keycodes holdes nede sammen, tekst-strenge skrives,
tal (float) er pauser, `("CC", kode)` er medietaster. `app("navn")` åbner et program
via Spotlight.

Nemmest: sig til Claude hvad der skal ændres ("byt Fotos ud med Billy", "tilføj en
side til Photoshop") — koden opdateres i repoet, og du kører install-kommandoen igen.

## Andre filer

- `code-midi.py` — den tidligere MIDI-controller-version (5 sider, CC-beskeder til lysstyring).
  Skift tilbage ved at lægge den på boardet som `code.py`.
- `install.sh` — install-scriptet bag én-kommando-installationen.

## Krævede biblioteker på boardet

Skal ligge i `lib/` på CIRCUITPY-drevet (er der allerede):
`adafruit_macropad`, `adafruit_display_text`, `adafruit_hid`,
`adafruit_seesaw` (kun for Stemma-encoderen — koden kører også uden).

## Fejlsøgning

Fuld fejlbesked fra boardet: `screen /dev/tty.usbmodem*01 115200` → tryk en tast →
Ctrl-D genstarter og printer traceback. Afslut screen med Ctrl-A, K, Y.

Bemærk: `app("...")`-genvejene skriver programnavnet i Spotlight med US-tastaturlayout,
så brug kun a-z, 0-9, mellemrum og bindestreg i navnene.
