# code.py — MacroPad RP2040 — v1.5.x “god kode”-stil (uden NeoKeys)
# 5 sider: KEYPAD, CCT, COLOR, MOVING, TEST
# Ekstern Stemma QT encoder (Seesaw, 0x36): drej = CC 0..127, tryk skifter funktion på SIDE 1
#
# Thomas / Lys Afd.

import time
import math
import board
import displayio
import terminalio
import usb_midi

from adafruit_display_text import label
from adafruit_macropad import MacroPad

import adafruit_midi
from adafruit_midi.control_change import ControlChange

# --- Seesaw / Stemma QT encoder (valgfri) ---
STEMMA_I2C_ADDR = 0x36
STEMMA_SWITCH_PIN = 24  # Seesaw QT Rotary Encoder switch pin
STEMMA_NEOPIXEL_PIN = 6  # Seesaw NeoPixel pin
STEMMA_NEOPIXEL_COUNT = 1

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

    st_np = SeesawNeoPixel(ss, STEMMA_NEOPIXEL_PIN, STEMMA_NEOPIXEL_COUNT, brightness=0.25)
    st_np.fill((0, 0, 0))
    st_present = True
except Exception as e:
    st_present = False

# -------------------------
# MacroPad setup
# -------------------------
macropad = MacroPad()
macropad.pixels.auto_write = True
macropad.pixels.brightness = 0.25

# USB MIDI
midi = adafruit_midi.MIDI(midi_out=usb_midi.ports[1], out_channel=0)

# -------------------------
# UI / Display
# -------------------------
display = macropad.display
group = displayio.Group()
display.root_group = group

title = label.Label(terminalio.FONT, text="MACROPAD", x=2, y=8)
status = label.Label(terminalio.FONT, text="", x=2, y=28)
hint = label.Label(terminalio.FONT, text="", x=2, y=48)
group.append(title)
group.append(status)
group.append(hint)

def ui(page_name, main="", sub=""):
    title.text = page_name
    status.text = main[:21]
    hint.text = sub[:21]
    display.refresh()

# -------------------------
# Helpers
# -------------------------
def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v

def send_cc(cc, val):
    val = int(clamp(val, 0, 127))
    midi.send(ControlChange(cc, val))

def wheel(pos):
    # simple RGB wheel 0..255
    pos = pos % 256
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    if pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    pos -= 170
    return (pos * 3, 0, 255 - pos * 3)

def kelvin_to_rgb(k):
    # Approximation: k in [1800..10000]
    k = clamp(k, 1800, 10000) / 100.0
    # Red
    if k <= 66:
        r = 255
    else:
        r = 329.698727446 * ((k - 60) ** -0.1332047592)
    # Green
    if k <= 66:
        g = 99.4708025861 * math.log(k) - 161.1195681661
    else:
        g = 288.1221695283 * ((k - 60) ** -0.0755148492)
    # Blue
    if k >= 66:
        b = 255
    elif k <= 19:
        b = 0
    else:
        b = 138.5177312231 * math.log(k - 10) - 305.0447927307
    return (int(clamp(r, 0, 255)), int(clamp(g, 0, 255)), int(clamp(b, 0, 255)))

def set_stemma_pixel(rgb, brightness=0.25):
    if not st_present:
        return
    st_np.brightness = clamp(brightness, 0.01, 1.0)
    st_np.fill(rgb)

# -------------------------
# Pages / Modes
# -------------------------
PAGE_KEYPAD = 0
PAGE_CCT = 1
PAGE_COLOR = 2
PAGE_MOVING = 3
PAGE_TEST = 4

page = PAGE_KEYPAD

# --- SIDE 1: “NIVEAU”-funktioner på Stemma QT encoder ---
MODE_INTENSITY = 0
MODE_CCT = 1
MODE_TINT = 2
MODE_HUE = 3
MODE_SAT = 4

niveau_mode = MODE_INTENSITY

# CC mapping (du kan ændre frit)
CC_INTENSITY = 21
CC_CCT = 22
CC_TINT = 23
CC_HUE = 24
CC_SAT = 25

# Current values 0..127
val_intensity = 64
val_cct = 64
val_tint = 64
val_hue = 0
val_sat = 127

def update_niveau_visuals():
    # Set Stemma NeoPixel based on active mode + value
    if not st_present:
        return

    if niveau_mode == MODE_INTENSITY:
        # white brightness
        b = clamp(val_intensity / 127.0, 0.03, 1.0)
        set_stemma_pixel((255, 255, 255), brightness=b)
        ui("KEYPAD", "INTENSITET", f"CC {CC_INTENSITY} = {val_intensity}")
    elif niveau_mode == MODE_CCT:
        # map 0..127 -> 2000..9000
        k = int(2000 + (val_cct / 127.0) * 7000)
        rgb = kelvin_to_rgb(k)
        set_stemma_pixel(rgb, brightness=0.25)
        ui("KEYPAD", "CCT", f"{k}K  (CC {CC_CCT}={val_cct})")
    elif niveau_mode == MODE_TINT:
        # 0..127 => magenta -> green
        t = val_tint / 127.0
        # magenta (255,0,255) to green (0,255,0)
        r = int(255 * (1.0 - t))
        g = int(255 * t)
        b = int(255 * (1.0 - t))
        set_stemma_pixel((r, g, b), brightness=0.25)
        ui("KEYPAD", "TINT", f"CC {CC_TINT} = {val_tint}")
    elif niveau_mode == MODE_HUE:
        # hue wheel
        rgb = wheel(int((val_hue / 127.0) * 255))
        set_stemma_pixel(rgb, brightness=0.25)
        ui("KEYPAD", "HUE", f"CC {CC_HUE} = {val_hue}")
    elif niveau_mode == MODE_SAT:
        # saturation: keep hue fixed (use hue value), scale toward white
        hue_rgb = wheel(int((val_hue / 127.0) * 255))
        s = val_sat / 127.0
        r = int(hue_rgb[0] * s + 255 * (1.0 - s))
        g = int(hue_rgb[1] * s + 255 * (1.0 - s))
        b = int(hue_rgb[2] * s + 255 * (1.0 - s))
        set_stemma_pixel((r, g, b), brightness=0.25)
        ui("KEYPAD", "SATURATION", f"CC {CC_SAT} = {val_sat}")

def next_niveau_mode():
    global niveau_mode
    niveau_mode = (niveau_mode + 1) % 5
    update_niveau_visuals()

# -------------------------
# MacroPad key layouts (12 keys)
# -------------------------
# Du kan ændre navne + CC pr side her:
pages = [
    {
        "name": "KEYPAD",
        "keys": [
            ("K1", 40), ("K2", 41), ("K3", 42),
            ("K4", 43), ("K5", 44), ("K6", 45),
            ("K7", 46), ("K8", 47), ("K9", 48),
            ("K10",49), ("K11",50), ("K12",51),
        ],
    },
    {
        "name": "CCT",
        "keys": [
            ("MAX K", 60), ("6000", 61), ("5600", 62),
            ("5500", 63), ("5000", 64), ("4000", 65),
            ("3200", 66), ("2900", 67), ("2700", 68),
            ("-100K", 69), ("+100K", 70), ("BACK", 71),
        ],
    },
    {
        "name": "COLOR",
        "keys": [
            ("RED", 80), ("GRN", 81), ("BLU", 82),
            ("CYN", 83), ("MAG", 84), ("YEL", 85),
            ("WHT", 86), ("AMB", 87), ("PINK",88),
            ("UV?", 89), ("FX1", 90), ("FX2", 91),
        ],
    },
    {
        "name": "MOVING",
        "keys": [
            ("PAN", 100), ("TILT", 101), ("SPD", 102),
            ("DIM", 103), ("STRB",104), ("ZOOM",105),
            ("FOCUS",106), ("GBO",107), ("PRSM",108),
            ("C1",109), ("C2",110), ("C3",111),
        ],
    },
    {
        "name": "TEST",
        "keys": [
            ("T1", 120), ("T2", 121), ("T3", 122),
            ("T4", 123), ("T5", 124), ("T6", 125),
            ("T7", 126), ("T8", 127), ("CC90=100", 90),
            ("RESET TG", 119), ("PAGE-", 116), ("PAGE+", 117),
        ],
    },
]

# Toggle states (hvis du vil bruge toggles på nogle keys)
toggle_states = [False] * 12

def load_page(p):
    global page
    page = p % len(pages)

    # simple page color theme
    if page == PAGE_KEYPAD:
        macropad.pixels.fill((10, 10, 10))
        ui("KEYPAD", "Stemma: INT/CCT/..", "Tryk Stemma = skift")
        if st_present:
            update_niveau_visuals()
    elif page == PAGE_CCT:
        macropad.pixels.fill((0, 0, 20))
        ui("CCT", "Knapper = presets", "Encoder = page")
    elif page == PAGE_COLOR:
        macropad.pixels.fill((0, 20, 0))
        ui("COLOR", "Farver / FX", "Encoder = page")
    elif page == PAGE_MOVING:
        macropad.pixels.fill((20, 0, 0))
        ui("MOVING", "Pan/Tilt mm.", "Encoder = page")
    elif page == PAGE_TEST:
        macropad.pixels.fill((15, 15, 0))
        ui("TEST", "Knap 10: CC90=100", "Knap 11: reset toggles")

load_page(PAGE_KEYPAD)

# -------------------------
# Main loop
# -------------------------
last_display = time.monotonic()
last_page_name = pages[page]["name"]

# MacroPad-encoderens position er kumulativ og kan ikke nulstilles,
# så vi sammenligner med sidste aflæsning i stedet
last_encoder_pos = macropad.encoder

# Init Stemma position
if st_present:
    st_last_pos = st_enc.position

while True:
    macropad.encoder_switch_debounced.update()
    key_event = macropad.keys.events.get()

    # --- MacroPad encoder: skift sider ---
    enc_pos = macropad.encoder
    if enc_pos != last_encoder_pos:
        if enc_pos > last_encoder_pos:
            load_page(page + 1)
        else:
            load_page(page - 1)
        last_encoder_pos = enc_pos

    # --- MacroPad encoder button: (valgfrit) hurtig tilbage til KEYPAD ---
    if macropad.encoder_switch_debounced.fell:
        load_page(PAGE_KEYPAD)

    # --- Keys ---
    if key_event:
        k = key_event.key_number
        name, cc = pages[page]["keys"][k]

        if key_event.pressed:
            # Special på TEST-siden
            if page == PAGE_TEST and name == "CC90=100":
                send_cc(90, 100)
                ui("TEST", "SEND", "CC 90 = 100")
            elif page == PAGE_TEST and name == "RESET TG":
                for i in range(12):
                    toggle_states[i] = False
                ui("TEST", "RESET", "toggle_states nulstillet")
            elif page == PAGE_TEST and name == "PAGE-":
                load_page(page - 1)
            elif page == PAGE_TEST and name == "PAGE+":
                load_page(page + 1)
            else:
                # Standard: momentary CC 127
                send_cc(cc, 127)
                ui(pages[page]["name"], f"{name}", f"CC {cc} = 127")

        if key_event.released:
            # Standard release: CC 0 (ikke for special-knapper)
            if not (page == PAGE_TEST and name in ("CC90=100", "RESET TG", "PAGE-", "PAGE+")):
                send_cc(cc, 0)

    # --- Stemma QT encoder (på SIDE 1 logik, men kører altid) ---
    if st_present:
        # rotation
        pos = st_enc.position
        delta = pos - st_last_pos
        if delta != 0:
            st_last_pos = pos

            # step size: 1 click = 1..2 værdier (justér her)
            step = 2
            if niveau_mode == MODE_INTENSITY:
                val_intensity = clamp(val_intensity + (step if delta > 0 else -step), 0, 127)
                send_cc(CC_INTENSITY, val_intensity)
                if page == PAGE_KEYPAD:
                    ui("KEYPAD", "INTENSITET", ("+ INT" if delta > 0 else "- INT"))
                update_niveau_visuals()

            elif niveau_mode == MODE_CCT:
                val_cct = clamp(val_cct + (step if delta > 0 else -step), 0, 127)
                send_cc(CC_CCT, val_cct)
                if page == PAGE_KEYPAD:
                    ui("KEYPAD", "CCT", ("+ KELVIN" if delta > 0 else "- KELVIN"))
                update_niveau_visuals()

            elif niveau_mode == MODE_TINT:
                val_tint = clamp(val_tint + (step if delta > 0 else -step), 0, 127)
                send_cc(CC_TINT, val_tint)
                if page == PAGE_KEYPAD:
                    ui("KEYPAD", "TINT", ("+ GREEN" if delta > 0 else "- MAGENTA"))
                update_niveau_visuals()

            elif niveau_mode == MODE_HUE:
                val_hue = clamp(val_hue + (step if delta > 0 else -step), 0, 127)
                send_cc(CC_HUE, val_hue)
                if page == PAGE_KEYPAD:
                    ui("KEYPAD", "HUE", ("+ HUE" if delta > 0 else "- HUE"))
                update_niveau_visuals()

            elif niveau_mode == MODE_SAT:
                val_sat = clamp(val_sat + (step if delta > 0 else -step), 0, 127)
                send_cc(CC_SAT, val_sat)
                if page == PAGE_KEYPAD:
                    ui("KEYPAD", "SAT", ("+ SAT" if delta > 0 else "- SAT"))
                update_niveau_visuals()

        # switch (debounce simpelt)
        sw_now = st_sw.value  # True = not pressed (pull-up)
        if sw_now != st_last_sw:
            time.sleep(0.02)
            sw_now2 = st_sw.value
            if sw_now2 == sw_now:
                st_last_sw = sw_now
                if sw_now is False:  # pressed
                    # Skift NIVEAU-mode (kun relevant for SIDE 1, men ok globalt)
                    next_niveau_mode()

    time.sleep(0.01)
