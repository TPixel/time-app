# MacroPad RP2040 — Mac Shortcut Keyboard

CircuitPython-kode til Adafruit MacroPad RP2040. Boardet fungerer som USB-tastatur
med 6 sider af genveje til Mac'en. Displayet viser alle 12 knappers funktion i et grid.

## v3.0: Tryk + Hold

- Knap 1 = øverste venstre hjørne … knap 12 = nederste højre hjørne (samme plads i displayets grid)
- Alle knapper har to funktioner: **tryk** (kort) og **hold** (over 0,4 sek)
- **Globalt på alle sider:** knap 12 hold = MUTE · knap 10 hold = åbn Lommeregner + boardet bliver numerisk tastatur (hold knap 10 igen = tilbage)
- Startsiden er **SYSTEM**
- Apple Genveje kan kobles på via `genvej(...)`-knapper (hyper-tast-kombination): åbn genvejen i Genveje-appen → (i) → "Tilføj tastaturgenvej" → tryk på MacroPad-knappen

## Installér på boardet (én kommando)

Sæt MacroPad'en i USB på din Mac og kør i Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/TPixel/time-app/claude/rp2040-usb-connection-1ivgl9/macropad/install.sh | bash
```

Scriptet henter nyeste `code.py` og lægger den på CIRCUITPY-drevet. Boardet genstarter selv.
Samme kommando bruges hver gang koden er blevet opdateret.

## Betjening

- **Indbygget encoder (øverst):** drej = skift side, tryk = tilbage til APPS-siden
- **Stemma QT encoder:** drej = lydstyrke op/ned, tryk = mute
- **Displayet** viser sidens navn øverst og alle 12 knappers funktion i 3×4-grid (samme layout som tasterne)

## Siderne

| Side | Indhold |
|---|---|
| APPS | Åbner programmer via Spotlight: Safari, Chrome, Mail, Noter, Finder, Terminal, Musik, Kalender, Beskeder, Fotos, Systemindstillinger, P-touch Editor |
| MACOS | Spotlight, emoji-vælger, lås skærm, skærmbilleder, Mission Control, skjul/luk app, tving luk, kopiér/sæt ind/fortryd |
| BROWSER | Ny/luk/genåbn tab, skift tab, reload, adressefelt, privat vindue, frem/tilbage, zoom |
| FINDER | Nyt vindue/mappe, info, quick look, slet, duplikér, genveje til Hentninger/Dokumenter/Skrivebord/Hjem, vis skjulte filer, AirDrop |
| MAIL | Ny mail, svar/svar alle/videresend, send, arkivér, slet, ulæst, flag, søg |
| MEDIE | Play/pause, næste/forrige, lydstyrke, mute, skærmlysstyrke, åbn Musik/Podcasts/Tidal |

## Tilpasning

Alle sider ligger i `PAGES`-listen i `code.py` — navn, farve og 12 taster pr. side.
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
