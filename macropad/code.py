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
# COMBO: knap 11 er combo-tast — hold den nede, saa viser displayet det
# GLOBALE combo-lag (COMBOS-listen, samme paa alle sider), og knapper med
# funktion lyser orange. Tryk en orange knap for at koere dens funktion.
# Knap 11 har derfor ingen egen hold-funktion; dens tryk virker som normalt.
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
# Skaerm-lysstyrke findes ikke i alle udgaver af adafruit_hid — None springes over
BRIGHT_UP = getattr(CC, "BRIGHTNESS_INCREMENT", None)
BRIGHT_DOWN = getattr(CC, "BRIGHTNESS_DECREMENT", None)

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
#   ("SCRIPT", "navn") -> koer AppleScript-makroen
#                         ~/.macropad/scripts/navn.applescript paa Mac'en

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
        elif isinstance(item, tuple) and item[0] == "SCRIPT":
            ser_send("script:" + item[1])
        elif isinstance(item, int):
            macropad.keyboard.press(item)
            pressed.append(item)
    for kc in pressed:
        macropad.keyboard.release(kc)

# -------------------------
# Sider — "match" er tekst der genkendes i den aktive apps navn
# Hver knap: (label, TRYK-sekvens, HOLD-sekvens eller None)
# (Combo-funktioner ligger globalt i COMBOS-listen laengere nede)
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
            ("Shot", [CMD, SHIFT, K.FOUR], ("Capture", [CMD, SHIFT, K.FIVE])),
            ("Mission", [CTRL, K.UP_ARROW], ("Lock", [CTRL, CMD, K.Q])),
            # Raekke 2 (knap 4-6)
            ("Copy", [CMD, K.C], ("Cut", [CMD, K.X])),
            ("Paste", [CMD, K.V], ("Plain", [CMD, SHIFT, ALT, K.V])),
            ("Undo", [CMD, K.Z], ("Redo", [CMD, SHIFT, K.Z])),
            # Raekke 3 (knap 7-9)
            ("Hide", [CMD, K.H], ("ForceQ", [CMD, ALT, K.ESCAPE])),
            ("CloseW", [CMD, K.W], ("QuitApp", [CMD, K.Q])),
            # Scene1: koerer Apple Genvejen "MacroPad Scene 1" (Hue-lamper
            # + lydstyrke 0) og skruer selv skaermen 8 trin ned
            ("Scene1", [("RUN", "MacroPad Scene 1")] + [("CC", BRIGHT_DOWN)] * 8,
             ("Shrtct2", genvej(K.TWO))),
            # Raekke 4 (knap 10-12)
            ("Calc", aabn("Calculator", "calculator"), None),  # hold = NUMPAD (global)
            ("Vol-", [("CC", CC.VOLUME_DECREMENT)], None),  # combo-tast
            ("Vol+", [("CC", CC.VOLUME_INCREMENT)], None),  # hold = MUTE (global)
        ],
    },
    {
        "name": "SAFARI",
        "match": "safari",
        "color": (0, 12, 30),
        "keys": [
            ("NewTab", [CMD, K.T], ("NewWin", [CMD, K.N])),
            ("ClosTab", [CMD, K.W], ("Reopen", [CMD, SHIFT, K.T])),
            ("Private", [CMD, SHIFT, K.N], None),
            ("PrevTab", [CTRL, SHIFT, K.TAB], None),
            ("NextTab", [CTRL, K.TAB], None),
            ("Reload", [CMD, K.R], None),
            ("Back", [CMD, K.LEFT_BRACKET], None),
            ("Forward", [CMD, K.RIGHT_BRACKET], None),
            ("Address", [CMD, K.L], ("Find", [CMD, K.F])),
            ("Bookmrk", [CMD, K.D], None),       # hold = NUMPAD (global)
            ("ReadLst", [CMD, SHIFT, K.D], None),  # combo-tast
            ("Downlds", [CMD, ALT, K.L], None),    # hold = MUTE (global)
        ],
    },
    {
        "name": "CHROME",
        "match": "chrome",
        "color": (25, 10, 0),
        "keys": [
            ("NewTab", [CMD, K.T], ("NewWin", [CMD, K.N])),
            ("ClosTab", [CMD, K.W], ("Reopen", [CMD, SHIFT, K.T])),
            ("Incogn", [CMD, SHIFT, K.N], None),
            ("PrevTab", [CTRL, SHIFT, K.TAB], None),
            ("NextTab", [CTRL, K.TAB], None),
            ("Reload", [CMD, K.R], ("HardRld", [CMD, SHIFT, K.R])),
            ("Back", [CMD, K.LEFT_BRACKET], None),
            ("Forward", [CMD, K.RIGHT_BRACKET], None),
            ("Address", [CMD, K.L], ("Find", [CMD, K.F])),
            ("Bookmrk", [CMD, K.D], None),       # hold = NUMPAD (global)
            ("DevTool", [CMD, ALT, K.I], None),    # combo-tast
            ("Downlds", [CMD, SHIFT, K.J], None),  # hold = MUTE (global)
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
            # Exp300-makro: resolution 300 + eksporter PNG til "Grafik upload"
            ("Exp300", [("SCRIPT", "pixelmator-300px")], None),  # hold = NUMPAD (global)
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
        ("8", [K.KEYPAD_EIGHT], ("/", [K.KEYPAD_FORWARD_SLASH])),
        ("9", [K.KEYPAD_NINE], ("+", [K.KEYPAD_PLUS])),
        ("4", [K.KEYPAD_FOUR], None),
        ("5", [K.KEYPAD_FIVE], None),
        ("6", [K.KEYPAD_SIX], ("-", [K.KEYPAD_MINUS])),
        ("1", [K.KEYPAD_ONE], None),
        ("2", [K.KEYPAD_TWO], None),
        ("3", [K.KEYPAD_THREE], ("x", [K.KEYPAD_ASTERISK])),
        ("0", [K.KEYPAD_ZERO], None),          # hold = tilbage (global)
        (",", [K.KEYPAD_PERIOD], None),        # combo-tast ("/" = hold paa 8)
        ("=", [K.KEYPAD_ENTER], None),         # hold = MUTE (global)
    ],
}

# -------------------------
# COMBO-lag — GLOBALT (samme paa alle sider). Hold knap 11 nede:
# displayet viser kun combo-navnene, og knapper MED funktion lyser orange.
# En plads er None (ingen funktion) eller ("navn", sekvens). Max 7 tegn.
# Plads 11 er selve combo-tasten.
# -------------------------
COMBOS = [
    None,                                    # 1
    None,                                    # 2
    ("Morgen", [("RUN", "Morgen")]),         # 3
    None,                                    # 4
    None,                                    # 5
    None,                                    # 6
    None,                                    # 7
    None,                                    # 8
    None,                                    # 9
    None,                                    # 10
    None,                                    # 11 = combo-tasten
    ("Play", [("CC", CC.PLAY_PAUSE)]),       # 12
]

LAYER = 10  # knap 11 = combo-tast (index 10)

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

def show_combo():
    # Combo-visning: kun combo-navne paa displayet, orange lys paa funktioner
    title.text = "< COMBO >"
    for i in range(12):
        c = COMBOS[i]
        cells[i].text = c[0][:7] if c else ""
        macropad.pixels[i] = (255, 120, 0) if c else (2, 2, 2)
    cells[LAYER].text = "COMBO"
    macropad.pixels[LAYER] = (255, 255, 255)

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
            if k != LAYER and LAYER in holdes:
                # COMBO: knap 11 holdt nede + denne knap (globalt lag)
                holdes[LAYER][1] = True   # brugt som combo — intet tryk ved slip
                holdes[k] = [nu, True]    # markeret fyret — slip goer intet
                combo = COMBOS[k]
                if combo is not None:
                    macropad.pixels[k] = (255, 255, 255)
                    title.text = ">> " + combo[0]
                    run_sequence(combo[1])
                    macropad.pixels[k] = (255, 120, 0)
            elif k == LAYER:
                holdes[k] = [nu, False]
                show_combo()
            else:
                holdes[k] = [nu, False]
                macropad.pixels[k] = (255, 255, 255)
        elif key_event.released and k in holdes:
            start, fyret = holdes.pop(k)
            if LAYER in holdes and k != LAYER:
                # combo-laget er stadig aktivt — behold combo-visningen
                macropad.pixels[k] = (255, 120, 0) if COMBOS[k] else (2, 2, 2)
            else:
                macropad.pixels[k] = current_page()["color"]
            if not fyret:
                # Kort tryk -> TRYK-funktion
                kd = current_page()["keys"][k]
                title.text = ">> " + kd[0]
                run_sequence(kd[1])
                show_page()
            elif k == LAYER:
                show_page()  # tilbage fra combo-visning

    # --- HOLD-detektering ---
    for k in list(holdes):
        start, fyret = holdes[k]
        if not fyret and (nu - start) >= HOLD_TID:
            holdes[k][1] = True
            if k == LAYER:
                # Combo-tasten: intet eget hold — combo-visningen er aktiv
                continue
            macropad.pixels[k] = (255, 60, 0)
            if k == 11:
                # Knap 12: hold = MUTE, altid
                title.text = ">> MUTE"
                macropad.consumer_control.send(CC.MUTE)
            elif k == 9:
                # Knap 10: hold = Lommeregner + NUMPAD til/fra
                toggle_numpad()
            else:
                hold = current_page()["keys"][k][2]
                if hold is not None:
                    title.text = ">> " + hold[0]
                    run_sequence(hold[1])

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
