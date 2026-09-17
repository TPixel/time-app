# daemper_rdm — RDM til dæmperen via TimoTwo (SPI)

Firmware-modul der gør dæmperen til en fuld **RDM-responder** (E1.20 + E1.37-1
dimmer-PIDs) gennem LumenRadio TimoTwo's SPI-interface. Dæmperen kan derefter
fjernopsættes fra enhver RDM-controller: DMX-adresse, personlighed, dimmer-kurve,
navn, identify, temperatur og indgangsspænding.

Modulet bruger TimoTwo i **modtager-tilstand (RDM RX)**. Det kræver ingen
ekstra licens fra LumenRadio — licensen gælder kun sender/proxy-tilstand (RDM TX).

## Hvorfor SPI og ikke DMX-linjen

Dit nuværende setup har MAX485 med DE hardwired HIGH, dvs. kun sende-retning.
RDM kræver at dæmperen også kan *svare* på linjen. De to muligheder:

| | SPI (valgt her) | DE på GPIO |
|---|---|---|
| Hardware-ændring | Ingen. MAX485 og DMX-linjen røres ikke | Ny ledning DE→MCU, evt. print-ændring |
| Timing | TimoTwo klarer al DMX/RDM-timing på linjen | MCU'en skal selv ramme RDM's break/MAB og svar-vinduer (µs-præcision) |
| DMX-data | Kan også hentes via SPI (DMX-vindue) — eller fortsat via UART | Uændret |
| Ekstra | TimoTwo's UART-DMX-udgang forbliver aktiv (CONFIG = 0x89) | — |

Med SPI fortæller vi TimoTwo vores RDM-UID (`BINDING_UID`-registret). Modulet
svarer selv på discovery for radiolinket og sender de RDM-pakker der er til os
over SPI. Vi svarer tilbage over SPI, og modulet lægger svaret på radioen.

## Ledninger

TimoTwo's SPI-interface bruger fem signaler + forsyning. Pin-numrene på selve
modulet står i TimoTwo-databladet (Integration Manual) — de er ikke gentaget
her, så de ikke bliver forkerte.

| TimoTwo | MCU | Bemærkning |
|---|---|---|
| SCK | SPI SCK | |
| MOSI | SPI MOSI | |
| MISO | SPI MISO | |
| CSn | `TIMO_CSN_PIN` (default 5) | aktiv lav |
| IRQ | `TIMO_IRQ_PIN` (default 3) | skal kunne lave ekstern interrupt (FALLING) |
| VDD / GND | 3,3 V / GND | **TimoTwo er 3,3 V-logik.** 5 V-boards (AVR Uno/Nano) kræver level-shifter |

SPI-hastighed er 2 MHz, mode 0, som i LumenRadios eksempler.

## Filer

| Fil | Hvad |
|---|---|
| `daemper_rdm.ino` | Arduino-sketch: EEPROM, sensorer, PWM-udgange, identify, TimoTwo-loop |
| `config.h` | **Det du tilpasser**: pins, antal kanaler, UID, navne |
| `rdm_responder.c/.h` | RDM-protokollen. Ren C99 uden Arduino-afhængigheder |
| `e120.h` | Konstanter fra E1.20 og E1.37-1 |
| `timo_spi.cpp/.h` | SPI-driver til TimoTwo (baseret på LumenRadios MIT-eksempel) |
| `test/` | Unit-tests af RDM-kernen + syntax-tjek af Arduino-filerne. Kører på Mac |
| `LICENSE-LumenRadio.txt` | MIT-licens for de dele der stammer fra LumenRadio |

## Byg og upload

1. Åbn `daemper_rdm/daemper_rdm.ino` i Arduino IDE (eller `arduino-cli`).
2. Ret `config.h`: pins, `DIMMER_CHANNELS`, `PWM_PINS`, sensor-pins, navne.
3. Vælg board og upload. Testet syntaktisk mod Arduino-API'et; kører på
   RP2040 (arduino-pico), ESP32 og AVR. RP2040/ESP32 får automatisk et unikt
   device-ID fra chippen; AVR bruger `RDM_DEVICE_ID_FALLBACK` — giv hver dæmper
   sit eget tal.
4. Åbn seriel monitor (115200). Ved start ser du UID, DMX-adresse og
   "TimoTwo klar (RX + SPI-RDM)".

### Manufacturer ID

`0x7FF0` er ESTA's prototype-område og fint til eget brug. Skal dæmperen ud
til andre, skal du have dit eget ID hos ESTA (tsp.esta.org, gratis).

## Sådan sættes det ind i din eksisterende firmware

RDM-kernen er lavet så den kan limes på uden at kende resten af din kode:

- **Udgange**: erstat indholdet af `apply_dmx()` med din egen udgangs-kode.
  Niveauerne ligger i `dmx_window[]` (rå DMX) og `levels[]` (efter kurve, 16 bit).
- **Beholder du DMX via UART/MAX485?** Så kan du droppe `TIMO_IRQ_DMX_CHANGED_FLAG`-
  delen i `handle_timo()` og blot læse `rdm.settings.dmx_start_address` og
  `rdm_responder_footprint(&rdm)` i din egen DMX-parser. SPI bruges så kun til RDM.
- **Kurver**: `apply_curve()` — tilføj/ret kurver dér og i `curves[]`.
- **Sensorer**: `read_temperature()` / `read_voltage()` returnerer 0,1 °C og
  0,1 V. Tilpas til din føler og spændingsdeler (`VOLT_DIVIDER_RATIO`).
- **Identify**: `service_identify()` blinker LED og pulserer udgangene 0/50 %.
- **Gem indstillinger**: sker i EEPROM via `settings_save()`. Har du allerede
  et lager, så kald dit eget dér.

Alt hvad RDM ændrer (adresse, personlighed, kurve, label) ender i
`rdm.settings`, og `on_settings_changed()` kaldes — dér hænger du din egen
logik på.

## Understøttede RDM-parametre

| PID | GET | SET | Bemærkning |
|---|---|---|---|
| DISC_UNIQUE_BRANCH / MUTE / UN_MUTE | ✓ | | Discovery, inkl. korrekt kodet DUB-svar |
| DEVICE_INFO | ✓ | | Kategori: DC PWM-dæmper (kan ændres i `config.h`) |
| SUPPORTED_PARAMETERS | ✓ | | |
| SOFTWARE_VERSION_LABEL | ✓ | | |
| MANUFACTURER_LABEL | ✓ | | |
| DEVICE_MODEL_DESCRIPTION | ✓ | | |
| DEVICE_LABEL | ✓ | ✓ | op til 32 tegn, gemmes |
| DMX_START_ADDRESS | ✓ | ✓ | 1 … 513−footprint, gemmes, opdaterer TimoTwo's DMX-vindue |
| DMX_PERSONALITY | ✓ | ✓ | 1: 8-bit pr. kanal, 2: 16-bit pr. kanal |
| DMX_PERSONALITY_DESCRIPTION | ✓ | | |
| IDENTIFY_DEVICE | ✓ | ✓ | |
| RESET_DEVICE | | ✓ | varm/kold genstart af MCU |
| DIMMER_INFO (E1.37-1) | ✓ | | |
| CURVE (E1.37-1) | ✓ | ✓ | Lineær, kvadratisk, S-kurve, kubisk |
| CURVE_DESCRIPTION (E1.37-1) | ✓ | | |
| SENSOR_DEFINITION | ✓ | | 0: temperatur (°C), 1: indgangsspænding (V DC) |
| SENSOR_VALUE | ✓ | ✓ | SET nulstiller laveste/højeste |

Broadcast- og vendorcast-SET udføres uden svar, som standarden kræver.
Ukendte PIDs, forkerte command classes, forkert datalængde og værdier uden for
område NACK'es med den rigtige årsagskode. Sub-devices understøttes ikke.

## Test uden hardware

```
cd daemper_rdm/test
make          # bygger og kører 397 checks af RDM-kernen
make syntax   # syntax-tjekker sketch + SPI-driver mod stub-headers
```

Testene bygger pakker præcis som en RDM-controller sender dem og verificerer
svarene byte for byte (checksum, UID-bytning, transaction number, NACK-koder,
DUB-kodning osv.).

## Test med hardware

Du skal bruge en CRMX-sender med RDM-support og en RDM-controller bag den
(lyskonsol med RDM, eller en håndtester som Swisson XMT-350). Gør så:

1. Link dæmperens TimoTwo til senderen som normalt.
2. Kør RDM-discovery på controlleren. Dæmperen dukker op som
   "TPixel / Daemper 4ch" med UID `7FF0:xxxxxxxx`.
3. Sæt DMX-adresse fra controlleren → serielt ser du "Indstillinger gemt", og
   `DMX_WINDOW` i TimoTwo flyttes med.
4. Slå Identify til → LED blinker, udgangene pulserer.
5. Skift kurve og læs sensorerne.

Vil du bygge din egen controller med LumenRadios `crmx-timotwo-spi-rdm-master`-
eksempel, kræver det en TimoTwo i sender-tilstand **med RDM TX-licens**
(sales@lumenradio.com).

## Antagelser og begrænsninger

- Din eksisterende dæmper-firmware lå ikke i nogen af GitHub-repo'erne, så
  modulet er lavet selvstændigt med tydelige indgangspunkter (se ovenfor) i
  stedet for at være flettet ind i din kode.
- SPI-handshaken er portet fra LumenRadios eksempel og syntax-tjekket, men
  ikke kørt mod et fysisk TimoTwo-modul herfra. RDM-kernen er fuldt testet.
- Standard-PWM er 8 bit (`analogWrite`). 16-bit personligheden giver 16-bit
  kurveberegning, men udgangen afrundes til boardets PWM-opløsning.
- MINIMUM_LEVEL / MAXIMUM_LEVEL, ACK_TIMER, queued messages og sub-devices er
  ikke implementeret.
- Dokumentationssiden docs.lumenrad.io var ikke tilgængelig fra dette miljø;
  registerbetydningerne stammer fra LumenRadios eksempelkode.
