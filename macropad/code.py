# code.py — MacroPad RP2040 — Mac Shortcut Keyboard v5.0
#
# Siderne ER apps: drej encoderen for at skifte side, og boardet aabner
# selv den app siden hoerer til (efter et kort oejeblik, saa man kan
# dreje forbi uden at aabne alt undervejs).
#
#   Side 1: SYSTEM     (ingen app)
#   Side 2: SAFARI     -> aabner Safari
#   Side 3: CHROME     -> aabner Chrome
#   Side 4: PIXELM     -> aabner Pixelmator Pro
#
# Knap-nummerering: 1 = øverste venstre hjørne ... 12 = nederste højre hjørne
# Alle knapper: TRYK (kort) og HOLD (>0.4 sek)
# Globale holds:
#   Knap 12 hold = MUTE
#   Knap 10 hold = åbn Lommeregner + NUMPAD til/fra
# Encoder-tryk = tilbage til SYSTEM
# Stemma QT encoder (valgfri): drej = lydstyrke, tryk = mute
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

HOLD_TID = 0.4        # sekunder før et tryk tæller som HOLD
APP_AABN_VENT = 0.8   # sekunder efter sidste drej før sidens app aabnes

# -------------------------
# Genvejs-sekvenser
# -------------------------
# En sekvens er en liste af trin:
#   int (Keycode)  -> tasten holdes nede, alle slippes til sidst
#   str            -> teksten skrives (kun a-z/0-9 — US-layout)
#   float          -> pause i sekunder (slipper først holdte taster)
#   ("CC", code)   -> medietast (ConsumerControl)

def app(navn):
    # Åbn program via Spotlight: Cmd+Space, skriv navn, Enter
    return [CMD, K.SPACE, 0.30, navn, 0.45, K.ENTER]

def genvej(tast):
    # "Hyper-tast" (Cmd+Alt+Ctrl+Shift + tast) til Apple Genveje:
    # I Genveje-appen: åbn genvejen -> (i) -> "Tilføj tastaturgenvej"
    # -> tryk på MacroPad-knappen. Så kører genvejen ved tryk.
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
        elif isinstance(item, int):
            macropad.keyboard.press(item)
            pressed.append(item)
    for kc in pressed:
        macropad.keyboard.release(kc)

# -------------------------
# Sider — hver side har evt. en "app" som aabnes naar man skifter til den
# Hver knap: (label, TRYK-sekvens, HOLD-sekvens eller None)
# Knap 1 = øverst venstre ... knap 12 = nederst højre
# Label max 7 tegn, kun ASCII (æøå kan ikke vises på displayet)
# -------------------------
PAGES = [
    {
        "name": "SYSTEM",
        "app": None,
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
            ("Lommer", app("calculator"), None),   # hold = NUMPAD (global)
            ("Vol-", [("CC", CC.VOLUME_DECREMENT)], ("Play", [("CC", CC.PLAY_PAUSE)])),
            ("Vol+", [("CC", CC.VOLUME_INCREMENT)], None),  # hold = MUTE (global)
        ],
    },
    {
        "name": "SAFARI",
        "app": "safari",
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
        "app": "chrome",
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
        "name": "PIXELM",
        "app": "pixelmator pro",
        "color": (15, 0, 25),
        "keys": [
            ("Ny", [CMD, K.N], ("Aabn", [CMD, K.O])),
            ("Gem", [CMD, K.S], ("GemSom", [CMD, SHIFT, K.S])),
            ("Export", [CMD, SHIFT, K.E], None),
            ("Zoom-", [CMD, K.MINUS], ("ZoomFit", [CMD, K.ZERO])),
            ("Zoom+", [CMD, K.EQUALS], None),
            ("Crop", [K.C], None),
            ("Vaelg", [K.V], None),
            ("Tekst", [K.T], None),
            ("Fortryd", [CMD, K.Z], ("Gentag", [CMD, SHIFT, K.Z])),
            ("Kopier", [CMD, K.C], None),        # hold = NUMPAD (global)
            ("Saet", [CMD, K.V], None),
            ("Slet", [K.BACKSPACE], None),       # hold = MUTE (global)
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
        run_sequence(app("calculator"))
        numpad_active = True
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

# Sidens app aabnes foerst naar man er landet paa siden (debounce)
app_aabn_tid = None
app_aabn_navn = None

while True:
    nu = time.monotonic()
    macropad.encoder_switch_debounced.update()
    key_event = macropad.keys.events.get()

    # --- Encoder: drej = skift side (og aabn sidens app naar man lander) ---
    enc_pos = macropad.encoder
    if enc_pos != last_encoder_pos:
        numpad_active = False
        page = (page + (1 if enc_pos > last_encoder_pos else -1)) % len(PAGES)
        last_encoder_pos = enc_pos
        show_page()
        if PAGES[page]["app"] is not None:
            app_aabn_tid = nu + APP_AABN_VENT
            app_aabn_navn = PAGES[page]["app"]
        else:
            app_aabn_tid = None

    # --- Aabn sidens app naar drejet er faldet til ro ---
    if app_aabn_tid is not None and nu >= app_aabn_tid:
        app_aabn_tid = None
        title.text = ">> " + current_page()["name"]
        run_sequence(app(app_aabn_navn))
        show_page()

    # --- Encoder-tryk: tilbage til SYSTEM ---
    if macropad.encoder_switch_debounced.fell:
        numpad_active = False
        page = 0
        app_aabn_tid = None
        show_page()

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
