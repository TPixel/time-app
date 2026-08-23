# code.py — MacroPad RP2040 — Mac Shortcut Keyboard v3.0
#
# Knap-nummerering: 1 = øverste venstre hjørne ... 12 = nederste højre hjørne
# (samme placering i displayets 3x4-grid som på selve tasterne)
#
# Alle knapper har TO funktioner: TRYK (kort) og HOLD (>0.4 sek)
# Globale holds (gælder på ALLE sider):
#   Knap 12 hold = MUTE
#   Knap 10 hold = åbn Lommeregner + boardet bliver numerisk tastatur
#                  (hold knap 10 igen for at gå tilbage)
#
# Indbygget encoder: drej = skift side, tryk = tilbage til SYSTEM
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

HOLD_TID = 0.4  # sekunder før et tryk tæller som HOLD

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
# Sider
# Hver knap: (label, TRYK-sekvens, HOLD-sekvens eller None)
# Knap 1 = øverst venstre ... knap 12 = nederst højre
# Label max 7 tegn, kun ASCII (æøå kan ikke vises på displayet)
# -------------------------
PAGES = [
    {
        "name": "SYSTEM",
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
        "name": "APPS",
        "color": (20, 0, 20),
        "keys": [
            ("Safari", app("safari"), None),
            ("Chrome", app("chrome"), None),
            ("Mail", app("mail"), None),
            ("Noter", app("notes"), None),
            ("Finder", app("finder"), None),
            ("Term", app("terminal"), None),
            ("Musik", app("music"), None),
            ("Kalend", app("calendar"), None),
            ("Besked", app("messages"), None),
            ("Fotos", app("photos"), None),
            ("Indst", app("system settings"), None),
            ("Ptouch", app("p-touch editor"), None),
        ],
    },
    {
        "name": "BROWSER",
        "color": (0, 25, 25),
        "keys": [
            ("NyTab", [CMD, K.T], ("NytVind", [CMD, K.N])),
            ("LukTab", [CMD, K.W], ("Genabn", [CMD, SHIFT, K.T])),
            ("Reload", [CMD, K.R], ("HardRel", [CMD, SHIFT, K.R])),
            ("NsteTab", [CTRL, K.TAB], None),
            ("ForrTab", [CTRL, SHIFT, K.TAB], None),
            ("Adresse", [CMD, K.L], ("Privat", [CMD, SHIFT, K.N])),
            ("Tilbage", [CMD, K.LEFT_BRACKET], None),
            ("Frem", [CMD, K.RIGHT_BRACKET], None),
            ("Bogmrk", [CMD, K.D], ("VisBogm", [CMD, ALT, K.B])),
            ("Zoom-", [CMD, K.MINUS], ("Zoom0", [CMD, K.ZERO])),
            ("Zoom+", [CMD, K.EQUALS], None),
            ("Soeg", [CMD, K.F], None),
        ],
    },
    {
        "name": "FINDER",
        "color": (0, 25, 0),
        "keys": [
            ("NytVind", [CMD, K.N], ("NyMappe", [CMD, SHIFT, K.N])),
            ("Info", [CMD, K.I], None),
            ("Kig", [K.SPACE], None),
            ("Slet", [CMD, K.BACKSPACE], ("TomSkrl", [CMD, SHIFT, K.BACKSPACE])),
            ("Duplik", [CMD, K.D], None),
            ("Omdoeb", [K.ENTER], None),
            ("Hentn", [CMD, ALT, K.L], None),
            ("Dokum", [CMD, SHIFT, K.O], None),
            ("Skrbord", [CMD, SHIFT, K.D], ("Hjem", [CMD, SHIFT, K.H])),
            ("Skjulte", [CMD, SHIFT, K.PERIOD], None),
            ("AirDrop", [CMD, SHIFT, K.R], None),
            ("SoegFil", [CMD, K.F], None),
        ],
    },
    {
        "name": "MAIL",
        "color": (25, 12, 0),
        "keys": [
            ("NyMail", [CMD, K.N], None),
            ("Svar", [CMD, K.R], ("SvarAll", [CMD, SHIFT, K.R])),
            ("Videre", [CMD, SHIFT, K.F], None),
            ("Send", [CMD, SHIFT, K.D], None),
            ("Arkiver", [CTRL, CMD, K.A], None),
            ("Slet", [CMD, K.BACKSPACE], None),
            ("Ulaest", [CMD, SHIFT, K.U], None),
            ("Flag", [CMD, SHIFT, K.L], None),
            ("Soeg", [CMD, ALT, K.F], None),
            ("Gem", [CMD, K.S], None),
            ("Hent", [CMD, SHIFT, K.N], None),
            ("LukVind", [CMD, K.W], None),
        ],
    },
    {
        "name": "MEDIE",
        "color": (25, 25, 0),
        "keys": [
            ("Play", [("CC", CC.PLAY_PAUSE)], None),
            ("Forrige", [("CC", CC.SCAN_PREVIOUS_TRACK)], None),
            ("Naeste", [("CC", CC.SCAN_NEXT_TRACK)], None),
            ("Vol-", [("CC", CC.VOLUME_DECREMENT)], None),
            ("Mute", [("CC", CC.MUTE)], None),
            ("Vol+", [("CC", CC.VOLUME_INCREMENT)], None),
            ("Lys-", [("CC", getattr(CC, "BRIGHTNESS_DECREMENT", None))], None),
            ("Stop", [("CC", CC.STOP)], None),
            ("Lys+", [("CC", getattr(CC, "BRIGHTNESS_INCREMENT", None))], None),
            ("Musik", app("music"), None),
            ("Podcast", app("podcasts"), None),
            ("Tidal", app("tidal"), None),
        ],
    },
]

# NUMPAD — speciel side (aktiveres med hold paa knap 10)
# Tal taster som rigtigt numerisk tastatur; hold giver regne-tegn
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

def load_page(p):
    global page, numpad_active
    numpad_active = False
    page = p % len(PAGES)
    show_page()

def toggle_numpad():
    global numpad_active
    if numpad_active:
        numpad_active = False
    else:
        run_sequence(app("calculator"))
        numpad_active = True
    show_page()

load_page(0)

# -------------------------
# Main loop
# -------------------------
last_encoder_pos = macropad.encoder

if st_present:
    st_last_pos = st_enc.position

# key_number -> [starttid, hold_er_fyret]
holdes = {}

while True:
    nu = time.monotonic()
    macropad.encoder_switch_debounced.update()
    key_event = macropad.keys.events.get()

    # --- Indbygget encoder: skift side (forlader ogsaa NUMPAD) ---
    enc_pos = macropad.encoder
    if enc_pos != last_encoder_pos:
        load_page(page + (1 if enc_pos > last_encoder_pos else -1))
        last_encoder_pos = enc_pos

    # --- Encoder-tryk: tilbage til SYSTEM ---
    if macropad.encoder_switch_debounced.fell:
        load_page(0)

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
                # Knap 12: hold = MUTE, altid, paa alle sider
                title.text = ">> MUTE"
                macropad.consumer_control.send(CC.MUTE)
            elif k == 9:
                # Knap 10: hold = Lommeregner + NUMPAD til/fra, alle sider
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
