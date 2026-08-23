# MacroPad RP2040 — MIDI-controller (Lys Afd.)

CircuitPython-kode til Adafruit MacroPad RP2040 med ekstern Stemma QT rotary encoder (Seesaw, 0x36).
5 sider: KEYPAD, CCT, COLOR, MOVING, TEST. Knapper sender MIDI CC, encoderen styrer intensitet/CCT/tint/hue/sat.

## Installér på boardet (én kommando)

Sæt MacroPad'en i USB på din Mac og kør i Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/TPixel/time-app/claude/rp2040-usb-connection-1ivgl9/macropad/install.sh | bash
```

Scriptet henter nyeste `code.py` og lægger den på CIRCUITPY-drevet. Boardet genstarter selv.

## Rettelser i forhold til den gamle version

- **`NameError` på linje 60** (den fejl displayet viste): `usb_midi` blev brugt uden at være importeret. Der er nu `import usb_midi` øverst.
- **Sideskift med MacroPad-encoderen virkede ikke**: `macropad.encoder` er en kumulativ, skrivebeskyttet position — koden prøvede at nulstille den (`macropad.encoder = 0`), hvilket ville crashe med `AttributeError` ved første drej. Nu sammenlignes med sidste aflæste position i stedet.

## Krævede biblioteker på boardet

Disse skal ligge i `lib/` på CIRCUITPY-drevet (de gjorde de allerede, da fejlen var en NameError og ikke en ImportError):

- `adafruit_macropad`
- `adafruit_display_text`
- `adafruit_midi`
- `adafruit_seesaw` (kun hvis Stemma-encoderen er tilsluttet — koden kører også uden)

## Fejlsøgning

Fuld fejlbesked fra boardet fås med: `screen /dev/tty.usbmodem*01 115200` → tryk en tast → Ctrl-D genstarter og printer traceback. Afslut screen med Ctrl-A, K, Y.
