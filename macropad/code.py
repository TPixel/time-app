# code.py — MacroPad RP2040 — Mac Shortcut Keyboard v6.0
#
# Boardet FOELGER den aktive app paa Mac'en: en lille follow-tjeneste
# (macropad-follow.sh, installeres automatisk) sender "app:Navn" over
# USB-seriel, og boardet skifter selv til den rigtige side. Ingen apps
# startes ved sideskift.
#
#   SYSTEM  = standard-side (alle andre apps)
#   SAFARI  = naar Safari er forrest
#   CHROME  = naar Chrome er forrest
#   PIXELM  = naar Pixelmator Pro er forrest
#
# Boardet kan ogsaa bede Mac'en om noget (elegant, uden Spotlight):
#   open:AppNavn    -> Mac'en koerer 'open -a AppNavn'
#   run:GenvejsNavn -> Mac'en koerer Apple Genvejen med det navn
# (Fallback: uden follow-tjenesten bruges Spotlight som foer.)
#
# Knap-nummerering: 1 = øverste venstre hjørne ... 12 = nederste højre hjørne
# Alle knapper: TRYK (kort) og HOLD (>0.4 sek)
# Globale holds:
#   Knap 12 hold = MUTE
#   Knap 10 hold = åbn Lommeregner + NUMPAD til/fra
# Encoder: drej = ZOOM ind/ud (Cmd+= / Cmd+-) i den aktive app
#          hold encoderen NEDE + drej = skift side manuelt
#          klik (uden at dreje) = tilbage til SYSTEM
# Stemma QT encoder (valgfri): drej = lydstyrke, tryk = mute
#
# REGEL: knap-labels er altid max 7 tegn naar alle knapper er i brug.
#
# Thomas / Lys Afd.

import time
import board
import displayio
import terminalio

from adafruit_display_text import label
from adafruit_macropad import MacroPad
from adafruit_hid.keycode import Keycode
from adafruit_hid.consumer_control_code import ConsumerControlCode

# --- Seriel dataport til Mac'ens follow-tjeneste (kraever boot.py) ---
ser = None
try:
    import usb_cdc
    ser = usb_cdc.data  # None hvis boot.py ikke er aktiv endnu
except Exception:
    ser = None

def ser_send(tekst):
    if ser is not None:
        try:
            ser.write((tekst + "\n").encode())
        except Exception:
            pass

# --- Seesaw / Stemma QT encoder (valgfri — koden kører fint uden) ---
STEMMA_I2C_ADDR = 0x36
STEMMA_SWITCH_PIN = 24
STEMMA_NEOPIXEL_PIN = 6

st_enc = None
st_sw = None
st_np = None
st_last_pos = 0
st_last_sw = True
st_present = False

try:
    import busio
    from adafruit_seesaw.seesaw import Seesaw
    from adafruit_seesaw import digitalio as seesaw_digitalio
    from adafruit_seesaw import rotaryio as seesaw_rotaryio
    from adafruit_seesaw.neopixel import NeoPixel as SeesawNeoPixel

    i2c = busio.I2C(board.SCL, board.SDA)
    ss = Seesaw(i2c, addr=STEMMA_I2C_ADDR)
    st_enc = seesaw_rotaryio.IncrementalEncoder(ss)
    st_sw = seesaw_digitalio.DigitalIO(ss, STEMMA_SWITCH_PIN)
    st_sw.switch_to_input(pull=seesaw_digitalio.Pull.UP)
    st_np = SeesawNeoPixel(ss, STEMMA_NEOPIXEL_PIN, 1, brightness=0.25)
    st_np.fill((0, 0, 0))
    st_present = True
except Exception:
    st_present = False

# -------------------------
# MacroPad setup
# -------------------------
macropad = MacroPad()
macropad.pixels.auto_write = True
macropad.pixels.brightness = 0.20

K = Keycode
CMD = K.COMMAND
SHIFT = K.SHIFT
ALT = K.OPTION
CTRL = K.CONTROL
CC = ConsumerControlCode

HOLD_TID = 0.4  # sekunder før et tryk tæller som HOLD

# -------------------------
# Genvejs-sekvenser
# -------------------------
# En sekvens er en liste af trin:
#   int (Keycode)     -> tasten holdes nede, alle slippes til sidst
#   str               -> teksten skrives (kun a-z/0-9 — US-layout)
#   float             -> pause i sekunder (slipper først holdte taster)
#   ("CC", code)      -> medietast (ConsumerControl)
#   ("OPEN", "App Navn", "spotlight navn")
#                     -> aabn app: via follow-tjenesten hvis muligt,
#                        ellers Spotlight-fallback
#   ("RUN", "Navn")   -> koer Apple Genvej med det navn (via follow-tjenesten)

def app(navn):
    # Spotlight-fallback: Cmd+Space, skriv navn, Enter
    return [CMD, K.SPACE, 0.30, navn, 0.45, K.ENTER]

def aabn(mac_navn, spotlight_navn):
    return [("OPEN", mac_navn, spotlight_navn)]

def genvej(tast):
    # "Hyper-tast" (Cmd+Alt+Ctrl+Shift + tast) til Apple Genveje via
    # tastaturgenvej. Alternativ: ("RUN", "Genvejens navn") koerer den
    # direkte ved navn via follow-tjenesten.
    return [CMD, ALT, CTRL, SHIFT, tast]

def run_sequence(seq):
    pressed = []
    for item in seq:
        if isinstance(item, float):
            for kc in pressed:
                macropad.keyboard.release(kc)
            pressed = []
            time.sleep(item)
        elif isinstance(item, str):
            for kc in pressed:
                macropad.keyboard.release(kc)
            pressed = []
            macropad.keyboard_layout.write(item)
        elif isinstance(item, tuple) and item[0] == "CC":
            if item[1] is not None:
                macropad.consumer_control.send(item[1])
        elif isinstance(item, tuple) and item[0] == "OPEN":
            if ser is not None:
                ser_send("open:" + item[1])
            else:
                run_sequence(app(item[2]))
        elif isinstance(item, tuple) and item[0] == "RUN":
            ser_send("run:" + item[1])
        elif isinstance(item, int):
            macropad.keyboard.press(item)
            pressed.append(item)
    for kc in pressed:
        macropad.keyboard.release(kc)

# -------------------------
# Sider — "match" er tekst der genkendes i den aktive apps navn
# Hver knap: (label, TRYK-sekvens, HOLD-sekvens eller None)
# Knap 1 = øverst venstre ... knap 12 = nederst højre
# Label max 7 tegn, kun ASCII (æøå kan ikke vises på displayet)
# -------------------------
PAGES = [
    {
        "name": "SYSTEM",
        "match": None,  # standard-siden
        "color": (0, 0, 25),
        "keys": [
            # Raekke 1 (knap 1-3)
            ("Spotlgt", [CMD, K.SPACE], ("Emoji", [CTRL, CMD, K.SPACE])),
            ("Shot", [CMD, SHIFT, K.FOUR], ("ShotUI", [CMD, SHIFT, K.FIVE])),
            ("Mission", [CTRL, K.UP_ARROW], ("Laas", [CTRL, CMD, K.Q])),
            # Raekke 2 (knap 4-6)
            ("Kopier", [CMD, K.C], ("Klip", [CMD, K.X])),
            ("Saet", [CMD, K.V], ("SaetRen", [CMD, SHIFT, ALT, K.V])),
            ("Fortryd", [CMD, K.Z], ("Gentag", [CMD, SHIFT, K.Z])),
            # Raekke 3 (knap 7-9)
            ("Skjul", [CMD, K.H], ("TvingLk", [CMD, ALT, K.ESCAPE])),
            ("LukVind", [CMD, K.W], ("LukApp", [CMD, K.Q])),
            ("Genvej1", genvej(K.ONE), ("Genvej2", genvej(K.TWO))),
            # Raekke 4 (knap 10-12)
            ("Lommer", aabn("Calculator", "calculator"), None),  # hold = NUMPAD (global)
            ("Vol-", [("CC", CC.VOLUME_DECREMENT)], ("Play", [("CC", CC.PLAY_PAUSE)])),
            ("Vol+", [("CC", CC.VOLUME_INCREMENT)], None),  # hold = MUTE (global)
        ],
    },
    {
        "name": "SAFARI",
        "match": "safari",
        "color": (0, 12, 30),
        "keys": [
            ("NyTab", [CMD, K.T], ("NytVind", [CMD, K.N])),
            ("LukTab", [CMD, K.W], ("Genabn", [CMD, SHIFT, K.T])),
            ("Privat", [CMD, SHIFT, K.N], None),
            ("ForrTab", [CTRL, SHIFT, K.TAB], None),
            ("NsteTab", [CTRL, K.TAB], None),
            ("Reload", [CMD, K.R], None),
            ("Tilbage", [CMD, K.LEFT_BRACKET], None),
            ("Frem", [CMD, K.RIGHT_BRACKET], None),
            ("Adresse", [CMD, K.L], ("Soeg", [CMD, K.F])),
            ("Bogmrk", [CMD, K.D], None),        # hold = NUMPAD (global)
            ("Laeslis", [CMD, SHIFT, K.D], ("VisLaes", [CMD, CTRL, K.TWO])),
            ("Hentn", [CMD, ALT, K.L], None),    # hold = MUTE (global)
        ],
    },
    {
        "name": "CHROME",
        "match": "chrome",
        "color": (25, 10, 0),
        "keys": [
            ("NyTab", [CMD, K.T], ("NytVind", [CMD, K.N])),
            ("LukTab", [CMD, K.W], ("Genabn", [CMD, SHIFT, K.T])),
            ("Inkogn", [CMD, SHIFT, K.N], None),
            ("ForrTab", [CTRL, SHIFT, K.TAB], None),
            ("NsteTab", [CTRL, K.TAB], None),
            ("Reload", [CMD, K.R], ("HardRel", [CMD, SHIFT, K.R])),
            ("Tilbage", [CMD, K.LEFT_BRACKET], None),
            ("Frem", [CMD, K.RIGHT_BRACKET], None),
            ("Adresse", [CMD, K.L], ("Soeg", [CMD, K.F])),
            ("Bogmrk", [CMD, K.D], None),        # hold = NUMPAD (global)
            ("DevTool", [CMD, ALT, K.I], ("Inspekt", [CMD, SHIFT, K.C])),
            ("Hentn", [CMD, SHIFT, K.J], None),  # hold = MUTE (global)
        ],
    },
    {
        # Layout efter Thomas' skitse (to tomme felter udfyldt med
        # Gem og Fortryd — ret frit)
        "name": "PIXELM",
        "match": "pixelmator",
        "color": (15, 0, 25),
        "keys": [
            # Raekke 1
            ("Save", [CMD, K.S], ("SaveAs", [CMD, SHIFT, K.S])),
            ("Paint", [K.B], None),
            ("ColSel", [K.W], None),             # Color Selection
            # Raekke 2
            ("Undo", [CMD, K.Z], ("Redo", [CMD, SHIFT, K.Z])),
            ("Select", [K.M], None),             # Selection
            ("Erase", [K.E], None),
            # Raekke 3
            ("Group", [CMD, K.G], None),
            ("Ungroup", [CMD, SHIFT, K.G], None),
            ("Fill", [K.N], None),               # Color Fill
            # Raekke 4
            ("Export", [CMD, SHIFT, K.E], None),  # hold = NUMPAD (global)
            ("Type", [K.T], None),
            ("Arrange", [K.V], None),             # hold = MUTE (global)
        ],
    },
]

# NUMPAD — aktiveres med hold paa knap 10
# Tal som rigtigt numerisk tastatur; hold giver regnetegn
NUMPAD = {
    "name": "NUMPAD",
    "color": (25, 25, 25),
    "keys": [
        ("7", [K.KEYPAD_SEVEN], ("C", [K.ESCAPE])),
        ("8", [K.KEYPAD_EIGHT], None),
        ("9", [K.KEYPAD_NINE], ("+", [K.KEYPAD_PLUS])),
        ("4", [K.KEYPAD_FOUR], None),
        ("5", [K.KEYPAD_FIVE], None),
        ("6", [K.KEYPAD_SIX], ("-", [K.KEYPAD_MINUS])),
        ("1", [K.KEYPAD_ONE], None),
        ("2", [K.KEYPAD_TWO], None),
        ("3", [K.KEYPAD_THREE], ("x", [K.KEYPAD_ASTERISK])),
        ("0", [K.KEYPAD_ZERO], None),          # hold = tilbage (global)
        (",", [K.KEYPAD_PERIOD], ("/", [K.KEYPAD_FORWARD_SLASH])),
        ("=", [K.KEYPAD_ENTER], None),         # hold = MUTE (global)
    ],
}

# -------------------------
# Display: titel + 3x4 grid med alle knap-labels
# -------------------------
display = macropad.display
group = displayio.Group()
display.root_group = group

title = label.Label(terminalio.FONT, text="MACROPAD", x=2, y=5)
group.append(title)

cells = []
for row in range(4):
    for col in range(3):
        cell = label.Label(terminalio.FONT, text="", x=2 + col * 43, y=19 + row * 13)
        group.append(cell)
        cells.append(cell)

page = 0
numpad_active = False

def current_page():
    return NUMPAD if numpad_active else PAGES[page]

def show_page():
    pg = current_page()
    title.text = ("< " + pg["name"] + " >")[:21]
    for i in range(12):
        cells[i].text = pg["keys"][i][0][:7]
    macropad.pixels.fill(pg["color"])
    if st_present:
        st_np.fill(pg["color"])

def toggle_numpad():
    global numpad_active
    if numpad_active:
        numpad_active = False
    else:
        run_sequence(aabn("Calculator", "calculator"))
        numpad_active = True
    show_page()

def foelg_app(app_navn):
    # Kaldes naar Mac'en melder ny forrest-app: find matchende side
    global page
    if numpad_active:
        return  # forstyr ikke en igangvaerende udregning
    navn = app_navn.lower()
    ny = 0  # SYSTEM som standard
    for i, pg in enumerate(PAGES):
        if pg["match"] is not None and pg["match"] in navn:
            ny = i
            break
    if ny != page:
        page = ny
        show_page()

show_page()

# -------------------------
# Main loop
# -------------------------
last_encoder_pos = macropad.encoder

if st_present:
    st_last_pos = st_enc.position

# key_number -> [starttid, hold_er_fyret]
holdes = {}

rx = b""  # seriel modtage-buffer

enc_sw_prev = False   # encoder-knappens forrige tilstand
enc_rotated = False   # blev der drejet mens knappen var nede?
enc_sw_tid = 0.0

while True:
    nu = time.monotonic()
    key_event = macropad.keys.events.get()

    # --- Beskeder fra Mac'ens follow-tjeneste ---
    if ser is not None and ser.in_waiting:
        try:
            rx += ser.read(ser.in_waiting)
        except Exception:
            rx = b""
        while b"\n" in rx:
            linje, rx = rx.split(b"\n", 1)
            try:
                tekst = linje.decode().strip()
            except Exception:
                continue
            if tekst.startswith("app:"):
                foelg_app(tekst[4:])
        if len(rx) > 256:
            rx = b""

    # --- Encoder ---
    enc_sw = macropad.encoder_switch  # True = holdt nede
    if enc_sw and not enc_sw_prev:
        enc_rotated = False
        enc_sw_tid = nu

    enc_pos = macropad.encoder
    if enc_pos != last_encoder_pos:
        retning = 1 if enc_pos > last_encoder_pos else -1
        antal = min(abs(enc_pos - last_encoder_pos), 5)
        last_encoder_pos = enc_pos
        if enc_sw:
            # Holdt nede + drej = skift side
            enc_rotated = True
            numpad_active = False
            page = (page + retning) % len(PAGES)
            show_page()
        else:
            # Drej alene = zoom i den aktive app.
            # Boardet sender fysiske tastepositioner og Mac'en bruger DANSK
            # layout: dansk "+" sidder paa US MINUS-tasten og dansk "-" paa
            # US FORWARD_SLASH-tasten.
            for _ in range(antal):
                run_sequence([CMD, K.MINUS] if retning > 0 else [CMD, K.FORWARD_SLASH])

    if not enc_sw and enc_sw_prev:
        # Sluppet: rent klik (uden drej) = tilbage til SYSTEM
        if not enc_rotated and (nu - enc_sw_tid) >= 0.05:
            numpad_active = False
            page = 0
            show_page()
    enc_sw_prev = enc_sw

    # --- Tastetryk / -slip ---
    if key_event:
        k = key_event.key_number
        if key_event.pressed:
            holdes[k] = [nu, False]
            macropad.pixels[k] = (255, 255, 255)
        elif key_event.released and k in holdes:
            start, fyret = holdes.pop(k)
            macropad.pixels[k] = current_page()["color"]
            if not fyret:
                # Kort tryk -> TRYK-funktion
                name, tap, _hold = current_page()["keys"][k]
                title.text = ">> " + name
                run_sequence(tap)
                show_page()

    # --- HOLD-detektering ---
    for k in list(holdes):
        start, fyret = holdes[k]
        if not fyret and (nu - start) >= HOLD_TID:
            holdes[k][1] = True
            macropad.pixels[k] = (255, 60, 0)
            if k == 11:
                # Knap 12: hold = MUTE, altid
                title.text = ">> MUTE"
                macropad.consumer_control.send(CC.MUTE)
            elif k == 9:
                # Knap 10: hold = Lommeregner + NUMPAD til/fra
                toggle_numpad()
            else:
                _name, _tap, hold = current_page()["keys"][k]
                if hold is not None:
                    hold_name, hold_seq = hold
                    title.text = ">> " + hold_name
                    run_sequence(hold_seq)

    # --- Stemma QT encoder: lydstyrke, tryk = mute ---
    if st_present:
        pos = st_enc.position
        delta = pos - st_last_pos
        if delta != 0:
            st_last_pos = pos
            code = CC.VOLUME_INCREMENT if delta > 0 else CC.VOLUME_DECREMENT
            for _ in range(min(abs(delta), 4)):
                macropad.consumer_control.send(code)

        sw_now = st_sw.value  # True = ikke trykket (pull-up)
        if sw_now != st_last_sw:
            time.sleep(0.02)
            if st_sw.value == sw_now:
                st_last_sw = sw_now
                if sw_now is False:
                    macropad.consumer_control.send(CC.MUTE)

    time.sleep(0.01)
