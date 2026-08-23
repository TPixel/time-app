# code.py — MacroPad RP2040 — Mac Shortcut Keyboard v2.0
# 6 sider: APPS, MACOS, BROWSER, FINDER, MAIL, MEDIE
# Indbygget encoder: drej = skift side, tryk = tilbage til APPS
# Stemma QT encoder (valgfri): drej = lydstyrke, tryk = mute
#
# Displayet viser alle 12 knappers funktion i et 3x4 grid.
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

# Brightness-taster findes ikke i alle udgaver af adafruit_hid
CC_BRIGHT_UP = getattr(ConsumerControlCode, "BRIGHTNESS_INCREMENT", None)
CC_BRIGHT_DOWN = getattr(ConsumerControlCode, "BRIGHTNESS_DECREMENT", None)

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
# Sider — ret frit i navne, labels og genveje
# Label max 7 tegn (pladsen i grid'et), kun ASCII (æøå kan ikke vises)
# -------------------------
PAGES = [
    {
        "name": "APPS",
        "color": (20, 0, 20),
        "keys": [
            ("Safari", app("safari")),
            ("Chrome", app("chrome")),
            ("Mail", app("mail")),
            ("Noter", app("notes")),
            ("Finder", app("finder")),
            ("Term", app("terminal")),
            ("Musik", app("music")),
            ("Kalend", app("calendar")),
            ("Besked", app("messages")),
            ("Fotos", app("photos")),
            ("Indst", app("system settings")),
            ("Ptouch", app("p-touch editor")),
        ],
    },
    {
        "name": "MACOS",
        "color": (0, 0, 25),
        "keys": [
            ("Spotlgt", [CMD, K.SPACE]),
            ("Emoji", [CTRL, CMD, K.SPACE]),
            ("Laas", [CTRL, CMD, K.Q]),
            ("Shot", [CMD, SHIFT, K.FOUR]),
            ("ShotUI", [CMD, SHIFT, K.FIVE]),
            ("Mission", [CTRL, K.UP_ARROW]),
            ("Skjul", [CMD, K.H]),
            ("TvingLk", [CMD, ALT, K.ESCAPE]),
            ("LukApp", [CMD, K.Q]),
            ("Kopier", [CMD, K.C]),
            ("Saet", [CMD, K.V]),
            ("Fortryd", [CMD, K.Z]),
        ],
    },
    {
        "name": "BROWSER",
        "color": (0, 25, 25),
        "keys": [
            ("NyTab", [CMD, K.T]),
            ("LukTab", [CMD, K.W]),
            ("Genabn", [CMD, SHIFT, K.T]),
            ("NsteTab", [CTRL, K.TAB]),
            ("ForrTab", [CTRL, SHIFT, K.TAB]),
            ("Reload", [CMD, K.R]),
            ("Adresse", [CMD, K.L]),
            ("Privat", [CMD, SHIFT, K.N]),
            ("Tilbage", [CMD, K.LEFT_BRACKET]),
            ("Frem", [CMD, K.RIGHT_BRACKET]),
            ("Zoom+", [CMD, K.EQUALS]),
            ("Zoom-", [CMD, K.MINUS]),
        ],
    },
    {
        "name": "FINDER",
        "color": (0, 25, 0),
        "keys": [
            ("NytVind", [CMD, K.N]),
            ("NyMappe", [CMD, SHIFT, K.N]),
            ("Info", [CMD, K.I]),
            ("Kig", [K.SPACE]),
            ("Slet", [CMD, K.BACKSPACE]),
            ("Duplik", [CMD, K.D]),
            ("Hentn", [CMD, ALT, K.L]),
            ("Dokum", [CMD, SHIFT, K.O]),
            ("Skrbord", [CMD, SHIFT, K.D]),
            ("Hjem", [CMD, SHIFT, K.H]),
            ("Skjulte", [CMD, SHIFT, K.PERIOD]),
            ("AirDrop", [CMD, SHIFT, K.R]),
        ],
    },
    {
        "name": "MAIL",
        "color": (25, 12, 0),
        "keys": [
            ("NyMail", [CMD, K.N]),
            ("Svar", [CMD, K.R]),
            ("SvarAll", [CMD, SHIFT, K.R]),
            ("Videre", [CMD, SHIFT, K.F]),
            ("Send", [CMD, SHIFT, K.D]),
            ("Arkiver", [CTRL, CMD, K.A]),
            ("Slet", [CMD, K.BACKSPACE]),
            ("Ulaest", [CMD, SHIFT, K.U]),
            ("Flag", [CMD, SHIFT, K.L]),
            ("Soeg", [CMD, ALT, K.F]),
            ("Gem", [CMD, K.S]),
            ("LukVind", [CMD, K.W]),
        ],
    },
    {
        "name": "MEDIE",
        "color": (25, 25, 0),
        "keys": [
            ("Play", [("CC", ConsumerControlCode.PLAY_PAUSE)]),
            ("Naeste", [("CC", ConsumerControlCode.SCAN_NEXT_TRACK)]),
            ("Forrige", [("CC", ConsumerControlCode.SCAN_PREVIOUS_TRACK)]),
            ("Vol+", [("CC", ConsumerControlCode.VOLUME_INCREMENT)]),
            ("Vol-", [("CC", ConsumerControlCode.VOLUME_DECREMENT)]),
            ("Mute", [("CC", ConsumerControlCode.MUTE)]),
            ("Lys+", [("CC", CC_BRIGHT_UP)]),
            ("Lys-", [("CC", CC_BRIGHT_DOWN)]),
            ("Stop", [("CC", ConsumerControlCode.STOP)]),
            ("Musik", app("music")),
            ("Podcast", app("podcasts")),
            ("Tidal", app("tidal")),
        ],
    },
]

# -------------------------
# Display: titel + 3x4 grid med alle key-labels
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

def show_page(pg):
    title.text = ("< " + pg["name"] + " >")[:21]
    for i in range(12):
        cells[i].text = pg["keys"][i][0][:7]

page = 0

def load_page(p):
    global page
    page = p % len(PAGES)
    pg = PAGES[page]
    macropad.pixels.fill(pg["color"])
    show_page(pg)
    if st_present:
        st_np.fill(pg["color"])

load_page(0)

# -------------------------
# Main loop
# -------------------------
last_encoder_pos = macropad.encoder

if st_present:
    st_last_pos = st_enc.position

while True:
    macropad.encoder_switch_debounced.update()
    key_event = macropad.keys.events.get()

    # --- Indbygget encoder: skift side ---
    enc_pos = macropad.encoder
    if enc_pos != last_encoder_pos:
        load_page(page + (1 if enc_pos > last_encoder_pos else -1))
        last_encoder_pos = enc_pos

    # --- Encoder-tryk: tilbage til APPS ---
    if macropad.encoder_switch_debounced.fell:
        load_page(0)

    # --- Taster ---
    if key_event and key_event.pressed:
        k = key_event.key_number
        name, seq = PAGES[page]["keys"][k]
        title.text = ">> " + name
        macropad.pixels[k] = (255, 255, 255)
        run_sequence(seq)
        macropad.pixels[k] = PAGES[page]["color"]
        title.text = ("< " + PAGES[page]["name"] + " >")[:21]

    # --- Stemma QT encoder: lydstyrke, tryk = mute ---
    if st_present:
        pos = st_enc.position
        delta = pos - st_last_pos
        if delta != 0:
            st_last_pos = pos
            code = (
                ConsumerControlCode.VOLUME_INCREMENT
                if delta > 0
                else ConsumerControlCode.VOLUME_DECREMENT
            )
            for _ in range(min(abs(delta), 4)):
                macropad.consumer_control.send(code)

        sw_now = st_sw.value  # True = ikke trykket (pull-up)
        if sw_now != st_last_sw:
            time.sleep(0.02)
            if st_sw.value == sw_now:
                st_last_sw = sw_now
                if sw_now is False:
                    macropad.consumer_control.send(ConsumerControlCode.MUTE)

    time.sleep(0.01)
