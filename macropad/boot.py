# boot.py — MacroPad RP2040
# Aktiverer den ekstra serielle dataport (usb_cdc.data), som Mac'ens
# follow-tjeneste bruger til at fortælle boardet hvilken app der er forrest,
# og som boardet bruger til at bede Mac'en åbne apps / køre Genveje.
#
# boot.py læses KUN ved opstart — tag USB-stikket ud og ind (eller tryk
# RESET) efter installation, før den virker.

import usb_cdc

usb_cdc.enable(console=True, data=True)
