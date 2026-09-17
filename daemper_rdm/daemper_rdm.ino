/*
 * daemper_rdm.ino — RDM-responder til en DMX-dæmper med LumenRadio TimoTwo.
 *
 * Dæmperen får både DMX-niveauer og RDM-forespørgsler fra TimoTwo over SPI.
 * MAX485/DMX-linjen røres ikke (TimoTwos UART-DMX-udgang forbliver aktiv).
 *
 * Opbygning:
 *   config.h          — pins, kanaler, identitet
 *   rdm_responder.c   — RDM-protokollen (ren C, testet i test/)
 *   timo_spi.cpp      — SPI-samtale med TimoTwo
 *   denne fil         — limer det sammen: EEPROM, sensorer, PWM, identify
 *
 * Understøttede RDM-PIDs: DISC_*, DEVICE_INFO, SUPPORTED_PARAMETERS,
 * SOFTWARE_VERSION_LABEL, MANUFACTURER_LABEL, DEVICE_MODEL_DESCRIPTION,
 * DEVICE_LABEL, DMX_START_ADDRESS, DMX_PERSONALITY(+_DESCRIPTION),
 * IDENTIFY_DEVICE, RESET_DEVICE, DIMMER_INFO, CURVE, CURVE_DESCRIPTION,
 * SENSOR_DEFINITION, SENSOR_VALUE.
 */
#include <Arduino.h>
#include <SPI.h>
#include <EEPROM.h>
#include <string.h>
#include "config.h"
#include "timo_spi.h"
#include "rdm_responder.h"

#if DEBUG_SERIAL
#define LOG(...) do { Serial.print(__VA_ARGS__); } while (0)
#define LOGLN(...) do { Serial.println(__VA_ARGS__); } while (0)
#else
#define LOG(...)   do {} while (0)
#define LOGLN(...) do {} while (0)
#endif

/* Prototyper (Arduino-IDE laver dem selv, men andre build-systemer gør ikke) */
static void on_timo_irq();
static void on_settings_changed(void *ctx);
static void on_identify(void *ctx, bool on);
static void on_reset(void *ctx, bool cold);
static int16_t read_temperature(void *ctx);
static int16_t read_voltage(void *ctx);
static uint32_t unique_device_id();
static void settings_load(rdm_settings_t *s);
static void settings_save(const rdm_settings_t *s);
static void apply_dmx();
static uint16_t apply_curve(uint16_t level16, uint8_t curve);
static void handle_timo();
static void service_identify();

/* ---- Enhedsbeskrivelse -------------------------------------------------- */

static const rdm_personality_t personalities[] = {
    { "8-bit pr. kanal",  DIMMER_CHANNELS,     8  },
    { "16-bit pr. kanal", DIMMER_CHANNELS * 2, 16 },
};

static const char *const curves[] = {
    "Lineaer",
    "Kvadratisk",
    "S-kurve",
    "Logaritmisk",
};

static const rdm_sensor_def_t sensors[] = {
    /* type, unit, prefix, range min/max, normal min/max, navn, læse-funktion */
#if TEMP_SENSOR_ENABLED
    { SENS_TEMPERATURE, UNITS_CENTIGRADE, PREFIX_DECI, -200, 1250, 0, 700, "Temperatur", read_temperature },
#endif
#if VOLT_SENSOR_ENABLED
    { SENS_VOLTAGE,     UNITS_VOLTS_DC,   PREFIX_DECI,    0,  400, 100, 260, "Indgangsspaending", read_voltage },
#endif
    { 0, 0, 0, 0, 0, 0, 0, NULL, NULL },   /* terminator, taelles ikke med */
};
#define SENSOR_COUNT (sizeof sensors / sizeof sensors[0] - 1)

static rdm_device_desc_t device = {
    /* uid */                      { RDM_MANUFACTURER_ID, RDM_DEVICE_ID_FALLBACK },
    /* device_model_id */          RDM_MODEL_ID,
    /* product_category */         RDM_PRODUCT_CATEGORY,
    /* software_version_id */      RDM_SOFTWARE_VERSION_ID,
    /* software_version_label */   RDM_SOFTWARE_VERSION,
    /* manufacturer_label */       RDM_MANUFACTURER_LABEL,
    /* device_model_description */ RDM_MODEL_DESCRIPTION,
    /* personalities */            personalities, sizeof personalities / sizeof personalities[0],
    /* curves */                   curves, sizeof curves / sizeof curves[0],
    /* sensors */                  sensors, SENSOR_COUNT,
    /* ctx */                      NULL,
    /* callbacks */                on_settings_changed, on_identify, on_reset,
};

/* ---- Tilstand ------------------------------------------------------------ */

static TimoSpi timo(TIMO_CSN_PIN, TIMO_IRQ_PIN);
static rdm_responder_t rdm;

static uint8_t  rdm_in[RDM_MAX_PACKET + 4];
static uint8_t  rdm_out[RDM_MAX_PACKET + 4];
static uint8_t  dmx_window[DIMMER_CHANNELS * 2 + 1];
static uint16_t levels[DIMMER_CHANNELS];          /* 0..65535 efter kurve */

static bool     timo_ready = false;
static bool     window_dirty = false;
static bool     settings_dirty = false;
static bool     linked = false;
static uint32_t last_sensor_ms = 0;
static uint32_t last_identify_ms = 0;
static bool     identify_phase = false;

/* ---- setup / loop -------------------------------------------------------- */

void setup()
{
#if DEBUG_SERIAL
    Serial.begin(DEBUG_BAUD);
    delay(200);
    LOGLN("daemper_rdm starter");
#endif

    for (uint8_t i = 0; i < DIMMER_CHANNELS; i++) { pinMode(PWM_PINS[i], OUTPUT); analogWrite(PWM_PINS[i], 0); }
    pinMode(IDENTIFY_LED_PIN, OUTPUT);
    digitalWrite(IDENTIFY_LED_PIN, LOW);

    device.uid.device = unique_device_id();

    rdm_settings_t saved;
    settings_load(&saved);
    rdm_responder_init(&rdm, &device, &saved);

    LOG("UID: "); LOG(device.uid.manufacturer, HEX); LOG(":"); LOGLN(device.uid.device, HEX);
    LOG("DMX-adresse: "); LOG(rdm.settings.dmx_start_address);
    LOG("  footprint: "); LOG(rdm_responder_footprint(&rdm));
    LOG("  kurve: "); LOGLN(rdm.settings.curve);

    timo.begin(TIMO_SPI_HZ);
    attachInterrupt(digitalPinToInterrupt(TIMO_IRQ_PIN), on_timo_irq, FALLING);
    delay(1000);
}

void loop()
{
    if (!timo_ready) {
        uint8_t uid[6];
        rdm_uid_to_bytes(&device.uid, uid);
        timo_ready = timo.setupAsRdmResponder(uid, rdm_responder_footprint(&rdm), rdm.settings.dmx_start_address);
        LOGLN(timo_ready ? "TimoTwo klar (RX + SPI-RDM)" : "TimoTwo svarer ikke - proever igen");
        if (!timo_ready) { delay(1000); return; }
        rdm_responder_sample_sensors(&rdm);
    }

    if (window_dirty) {
        window_dirty = false;
        timo.setDmxWindow(rdm_responder_footprint(&rdm), rdm.settings.dmx_start_address);
    }
    if (settings_dirty) {
        settings_dirty = false;
        settings_save(&rdm.settings);
    }

    if (timo.irqAsserted()) handle_timo();

    uint32_t now = millis();
    if (now - last_sensor_ms >= 1000) {
        last_sensor_ms = now;
        rdm_responder_sample_sensors(&rdm);
    }
    service_identify();
}

/* ---- TimoTwo-hændelser --------------------------------------------------- */

static void on_timo_irq() { timo.onIrqFalling(); }

static void handle_timo()
{
    int16_t flags = timo.readIrqFlags();
    if (flags < 0) return;

    if (flags & TIMO_IRQ_RF_LINK_FLAG) {
        uint8_t status = 0;
        timo.readReg(TIMO_STATUS_REG, &status, 1);
        linked = status & TIMO_STATUS_LINKED;
        LOG("RF link: "); LOGLN(linked ? "forbundet" : "ingen sender");
    }

    if (flags & TIMO_IRQ_DMX_CHANGED_FLAG) {
        uint16_t fp = rdm_responder_footprint(&rdm);
        if (timo.readDmx(dmx_window, fp) >= 0) apply_dmx();
    }

    if (flags & TIMO_IRQ_EXTENDED_FLAG) {
        uint32_t ext = timo.readExtIrqFlags();
        if (ext & TIMO_EXTIRQ_SPI_RDM_FLAG) {
            /* Som i LumenRadios eksempel: modulet giver en IRQ-puls naar
             * forespoergslen kan laeses. Vent kort paa den. */
            timo.waitForIrq(100);
            size_t n = timo.readRdmRequest(rdm_in, RDM_MAX_PACKET);
            if (n > 0) {
                size_t rlen = rdm_responder_handle(&rdm, rdm_in, n, rdm_out);
                LOG("RDM PID 0x"); LOG((rdm_in[21] << 8) | rdm_in[22], HEX);
                LOGLN(rlen ? "  -> svar" : "  -> intet svar");
                if (rlen > 0) timo.writeRdmResponse(rdm_out, rlen);
            }
        }
    }
}

/* ---- Callbacks fra RDM-kernen ------------------------------------------- */

static void on_settings_changed(void *ctx)
{
    (void)ctx;
    window_dirty = true;      /* nyt DMX-vindue til TimoTwo */
    settings_dirty = true;    /* gem i EEPROM (uden for RDM-svartiden) */
    apply_dmx();
}

static void on_identify(void *ctx, bool on)
{
    (void)ctx;
    LOG("Identify: "); LOGLN(on ? "TIL" : "FRA");
    if (!on) { digitalWrite(IDENTIFY_LED_PIN, LOW); apply_dmx(); }
}

static void on_reset(void *ctx, bool cold)
{
    (void)ctx;
    LOGLN(cold ? "RESET (kold)" : "RESET (varm)");
    delay(50);
#if defined(ARDUINO_ARCH_RP2040)
    rp2040.reboot();
#elif defined(ESP32) || defined(ESP8266)
    ESP.restart();
#elif defined(ARDUINO_ARCH_SAMD)
    NVIC_SystemReset();
#else
    /* Ingen kendt reset-metode: genstart TimoTwo-opsætningen i stedet */
    timo_ready = false;
#endif
}

/* Identify: blink LED og lad udgangene pulsere 0/50 % i 1 Hz så lampen kan findes. */
static void service_identify()
{
    if (!rdm.identifying) return;
    uint32_t now = millis();
    if (now - last_identify_ms < 500) return;
    last_identify_ms = now;
    identify_phase = !identify_phase;
    digitalWrite(IDENTIFY_LED_PIN, identify_phase ? HIGH : LOW);
    for (uint8_t i = 0; i < DIMMER_CHANNELS; i++) analogWrite(PWM_PINS[i], identify_phase ? 128 : 0);
}

/* ---- DMX -> udgange ------------------------------------------------------ */

static void apply_dmx()
{
    if (rdm.identifying) return;
    bool sixteen = rdm.settings.personality == 2;
    for (uint8_t i = 0; i < DIMMER_CHANNELS; i++) {
        uint16_t raw = sixteen
            ? (uint16_t)((dmx_window[2 * i] << 8) | dmx_window[2 * i + 1])
            : (uint16_t)(dmx_window[i] * 257u);           /* 0..255 -> 0..65535 */
        levels[i] = apply_curve(raw, rdm.settings.curve);
        analogWrite(PWM_PINS[i], levels[i] >> 8);         /* 8-bit PWM; skift til 16-bit hvis boardet kan */
    }
}

/* Dimmer-kurver, 16-bit ind og ud. */
static uint16_t apply_curve(uint16_t x, uint8_t curve)
{
    float f = x / 65535.0f;
    float y;
    switch (curve) {
    case 2:  y = f * f; break;                                   /* Kvadratisk */
    case 3:  y = f * f * (3.0f - 2.0f * f); break;               /* S-kurve (smoothstep) */
    case 4:  y = (f <= 0.0f) ? 0.0f : (f * f * f); break;        /* "Logaritmisk" opfattet: kubisk */
    default: y = f; break;                                       /* Lineaer */
    }
    if (y < 0.0f) y = 0.0f;
    if (y > 1.0f) y = 1.0f;
    return (uint16_t)(y * 65535.0f + 0.5f);
}

/* ---- Sensorer ------------------------------------------------------------ */

/* TMP36: 10 mV/°C med 500 mV offset. Returnerer 0,1 °C. Tilpas til din føler. */
static int16_t read_temperature(void *ctx)
{
    (void)ctx;
    float v = analogRead(TEMP_ADC_PIN) * ADC_REF_VOLT / ADC_MAX;
    float c = (v - 0.5f) * 100.0f;
    return (int16_t)(c * 10.0f);
}

/* Indgangsspænding via spændingsdeler. Returnerer 0,1 V. */
static int16_t read_voltage(void *ctx)
{
    (void)ctx;
    float v = analogRead(VOLT_ADC_PIN) * ADC_REF_VOLT / ADC_MAX * VOLT_DIVIDER_RATIO;
    return (int16_t)(v * 10.0f);
}

/* ---- Unikt device-ID ----------------------------------------------------- */

static uint32_t unique_device_id()
{
#if defined(ARDUINO_ARCH_RP2040)
    uint64_t id = rp2040.getChipID();
    return (uint32_t)(id ^ (id >> 32)) & 0x7FFFFFFFu;
#elif defined(ESP32)
    uint64_t mac = ESP.getEfuseMac();
    return (uint32_t)(mac ^ (mac >> 24)) & 0x7FFFFFFFu;
#else
    return RDM_DEVICE_ID_FALLBACK;
#endif
}

/* ---- EEPROM -------------------------------------------------------------- */

#define SETTINGS_MAGIC   0x52444D31u   /* "RDM1" */
#define SETTINGS_ADDR    0

struct settings_blob {
    uint32_t magic;
    rdm_settings_t s;
    uint8_t  xorsum;
};

static uint8_t blob_xor(const struct settings_blob *b)
{
    const uint8_t *p = (const uint8_t *)b;
    uint8_t x = 0x5A;
    for (size_t i = 0; i < offsetof(struct settings_blob, xorsum); i++) x ^= p[i];
    return x;
}

static void settings_load(rdm_settings_t *s)
{
    struct settings_blob b;
#if defined(ARDUINO_ARCH_RP2040) || defined(ESP32) || defined(ESP8266)
    EEPROM.begin(256);
#endif
    EEPROM.get(SETTINGS_ADDR, b);
    if (b.magic == SETTINGS_MAGIC && b.xorsum == blob_xor(&b)) {
        *s = b.s;
        LOGLN("Indstillinger indlaest fra EEPROM");
    } else {
        memset(s, 0, sizeof *s);
        s->dmx_start_address = 1;
        s->personality = 1;
        s->curve = 1;
        LOGLN("EEPROM tom - bruger standard");
    }
}

static void settings_save(const rdm_settings_t *s)
{
    struct settings_blob b;
    memset(&b, 0, sizeof b);
    b.magic = SETTINGS_MAGIC;
    b.s = *s;
    b.xorsum = blob_xor(&b);
    EEPROM.put(SETTINGS_ADDR, b);
#if defined(ARDUINO_ARCH_RP2040) || defined(ESP32) || defined(ESP8266)
    EEPROM.commit();
#endif
    LOGLN("Indstillinger gemt");
}
