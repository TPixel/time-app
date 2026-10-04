# Libelle — selvkørende digitalt vaterpas med grøn LED

En lille, batteridrevet enhed uden telefon og uden app: læg den på emnet, og
den **grønne LED lyser, når det er i vater**. Rød LED blinker, når det er skævt
(hurtigere blink = mere skævt). Den sover selv, når den ikke rører sig, og
vågner, når du tager den op.

```
            ┌───────────────────────────┐
            │  ● grøn   ● rød    [knap] │   ← låg
            │                           │
            │   XIAO ESP32-C3  MPU-6050 │   ← indeni
            │   LiPo 500 mAh            │
            └───────────────────────────┘
                USB-C til opladning
```

## Stykliste

| Antal | Del | Bemærkning |
|---|---|---|
| 1 | **Seeed XIAO ESP32-C3** | Lille (21×18 mm), USB-C, indbygget LiPo-lader. Ca. 50-60 kr. |
| 1 | **MPU-6050 modul (GY-521)** | Accelerometer/gyro, I2C. Ca. 15-30 kr. |
| 1 | Grøn LED 5 mm (gerne diffus, høj lysstyrke) | + 220 Ω modstand |
| 1 | Rød LED 5 mm | + 220 Ω modstand |
| 1 | Trykknap (6×6 mm taktil eller panelmonteret) | |
| 1 | LiPo 3,7 V 400-1000 mAh med beskyttelseskreds | Med JST-stik eller loddes på XIAO's BAT-pads |
| 1 | Skydeafbryder (valgfri) | Hvis du vil kunne slukke helt |
| 1 | Piezo-bipper 3 V (valgfri) | Kort "bip" når den rammer vater |
| | Kasse: 3D-print eller lille plastboks ca. 60×40×20 mm | Bunden skal være **plan og stiv** |

Alt fås hos fx AZ-Delivery, Elektronik-Lavpris, ebay/AliExpress eller Seeed Studio.

## Ledningsdiagram

XIAO ESP32-C3 — brug GPIO-numrene i koden, D-numrene står på printet:

```
XIAO ESP32-C3                MPU-6050 (GY-521)
  3V3  ──────────────────────  VCC
  GND  ──────────────────────  GND
  D4 (GPIO6, SDA) ───────────  SDA
  D5 (GPIO7, SCL) ───────────  SCL
  D0 (GPIO2) ────────────────  INT        (vækker enheden ved bevægelse)
                               AD0 → GND  (adresse 0x68; er som regel allerede trukket ned)

  D2 (GPIO4) ── 220 Ω ── grøn LED (+)   LED (–) → GND
  D3 (GPIO5) ── 220 Ω ── rød  LED (+)   LED (–) → GND
  D1 (GPIO3) ── knap ── GND              (intern pull-up, ingen modstand nødvendig)
  D6 (GPIO21) ── piezo (+)               piezo (–) → GND     (valgfri)

  BAT+ / BAT– (pads på undersiden) ── LiPo (via skydeafbryder på BAT+ hvis ønsket)
```

Monter MPU-6050-modulet **fladt og fast** i bunden af kassen (skruer eller
dobbeltklæbende tape). Det behøver ikke være perfekt lige, da kalibreringen
retter for det, men det må ikke kunne rokke.

## Firmware — sådan flasher du

1. Installer **Arduino IDE 2** (arduino.cc).
2. *Settings → Additional boards manager URLs*: tilføj
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. *Boards Manager*: installer **esp32 by Espressif Systems** (v3.x).
4. Åbn `libelle_esp32.ino`. Vælg board **XIAO_ESP32C3** og den port, der dukker op, når XIAO er sat i USB.
5. Tryk Upload. Ingen biblioteker skal installeres — sensoren styres direkte over I2C.
6. Åbn *Serial Monitor* (115200 baud) for at se hældningen live. Praktisk under kalibrering.

Bruger du et andet ESP32-board, så ret pin-numrene øverst i filen. På klassisk
ESP32 (ikke C3) skal `esp_deep_sleep_enable_gpio_wakeup` erstattes med
`esp_sleep_enable_ext1_wakeup`, resten er ens.

## Betjening

| Handling | Resultat |
|---|---|
| Læg enheden på emnet | Grøn = i vater. Rød blink = skæv (hurtigt blink = meget skævt) |
| **Kort tryk** | Skift tolerance 0,2° → 0,5° → 1° → 2°. Rød blinker 1-4 gange som kvittering. Gemmes. |
| **Hold 2 sek.** | Kalibrér: "denne stilling er 0°". Begge LED'er blinker 2 gange. |
| **Drej 180° på samme flade, hold 2 sek. igen (inden 30 s)** | 2-punkts-kalibrering. Begge LED'er blinker 4 gange. Nu er både sensorens skævhed i kassen *og* underlagets hældning regnet ud, så referencen er ægte vandret. |
| **Hold 6 sek.** | Slet kalibrering (rød blinker 6 gange). |
| Ingen bevægelse i 3 min. | Dyb søvn. Flyt den eller tryk på knappen for at vække. |

**Første gang:** Læg enheden på en nogenlunde vandret flade, hold 2 sek., drej
180°, hold 2 sek. igen. Derefter er den klar og husker det ved genstart.

## Batteritid (overslag)

| Tilstand | Strøm | 500 mAh |
|---|---|---|
| Tændt, måler | ca. 25-35 mA | 15-20 timer |
| Dyb søvn (sensor i motion-wake) | ca. 0,1-0,2 mA | måneder |

Vil du have mere, så sæt `IDLE_SLEEP_MS` ned (fx 60 s) eller brug et større batteri.

## Justering i koden

Øverst i `libelle_esp32.ino`:

- `TOL_STEPS` — tolerancerne knappen cykler igennem
- `FILTER_ALPHA` — lavere tal = roligere, men langsommere visning
- `IDLE_SLEEP_MS` — tid uden bevægelse før søvn
- `MOT_THR` (i `mpuInitMotionWake`) — hvor let den vågner. Lavere = mere følsom
- `BEEP_ON_LEVEL` — sæt til `false` hvis bipperen irriterer
- `PIN_BUZZER` — sæt til `-1` hvis der ingen bipper er

## Status

Firmwaren er skrevet og gennemgået, men **ikke kørt på hardware endnu**.
Kompilér i Arduino IDE først. Hvis noget driller: åbn Serial Monitor, den
skriver hældning og tyngdevektor to gange i sekundet, og siger "MPU-6050 ikke
fundet", hvis I2C-ledningerne er byttet om.
