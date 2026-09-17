/*
 * test_rdm.c — unit-test af RDM-kernen på en Mac/PC. Ingen hardware nødvendig.
 *
 *   cd daemper_rdm/test && make
 *
 * Testen bygger rå RDM-pakker som en controller ville sende dem, kører dem
 * gennem rdm_responder_handle() og tjekker svaret byte for byte.
 */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../rdm_responder.h"

static int failures = 0, checks = 0;
#define CHECK(cond) do { checks++; if (!(cond)) { failures++; printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define SECTION(name) printf("== %s\n", name)

/* ---- test-device ---------------------------------------------------- */

static int identify_calls, settings_calls, reset_calls; static bool last_identify, last_reset_cold;
static int16_t fake_temp = 250, fake_volt = 120;

static void on_settings(void *ctx) { (void)ctx; settings_calls++; }
static void on_identify(void *ctx, bool on) { (void)ctx; identify_calls++; last_identify = on; }
static void on_reset(void *ctx, bool cold) { (void)ctx; reset_calls++; last_reset_cold = cold; }
static int16_t read_temp(void *ctx) { (void)ctx; return fake_temp; }
static int16_t read_volt(void *ctx) { (void)ctx; return fake_volt; }

static const rdm_personality_t personalities[] = {
    { "4 kanaler 8-bit", 4, 8 },
    { "4 kanaler 16-bit", 8, 16 },
};
static const char *const curves[] = { "Lineaer", "Kvadratisk", "S-kurve" };
static const rdm_sensor_def_t sensors[] = {
    { SENS_TEMPERATURE, UNITS_CENTIGRADE, PREFIX_DECI, -200, 1000, 0, 700, "Temperatur", read_temp },
    { SENS_VOLTAGE, UNITS_VOLTS_DC, PREFIX_DECI, 0, 300, 100, 260, "Indgangsspaending", read_volt },
};
static const rdm_device_desc_t desc = {
    .uid = { 0x7FF0, 0x00000042 },
    .device_model_id = 0x0001,
    .product_category = PRODUCT_CATEGORY_DIMMER_DC_PWM,
    .software_version_id = 0x00010000,
    .software_version_label = "1.0.0",
    .manufacturer_label = "TPixel",
    .device_model_description = "Daemper",
    .personalities = personalities, .personality_count = 2,
    .curves = curves, .curve_count = 3,
    .sensors = sensors, .sensor_count = 2,
    .ctx = NULL,
    .on_settings_changed = on_settings, .on_identify = on_identify, .on_reset = on_reset,
};

static const uint8_t CTRL_UID[6] = { 0x12, 0x34, 0x00, 0x00, 0x00, 0x01 };
static const uint8_t MY_UID[6]   = { 0x7F, 0xF0, 0x00, 0x00, 0x00, 0x42 };
static const uint8_t BCAST[6]    = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };
static const uint8_t VCAST[6]    = { 0x7F, 0xF0, 0xFF, 0xFF, 0xFF, 0xFF };

static uint8_t req[RDM_MAX_PACKET], resp[RDM_MAX_PACKET];
static uint8_t tn = 0;

/* Bygger en pakke som en controller. Returnerer total længde inkl. checksum. */
static size_t build(const uint8_t dest[6], uint8_t cc, uint16_t pid, const uint8_t *pd, uint8_t pdl, uint16_t sub)
{
    memset(req, 0, sizeof req);
    req[0] = SC_RDM; req[1] = SC_SUB_MESSAGE;
    req[2] = (uint8_t)(RDM_HEADER_LEN + pdl);
    memcpy(req + 3, dest, 6);
    memcpy(req + 9, CTRL_UID, 6);
    req[15] = ++tn; req[16] = 1; req[17] = 0;
    req[18] = (uint8_t)(sub >> 8); req[19] = (uint8_t)sub;
    req[20] = cc; req[21] = (uint8_t)(pid >> 8); req[22] = (uint8_t)pid; req[23] = pdl;
    if (pdl) memcpy(req + 24, pd, pdl);
    uint16_t cs = rdm_checksum(req, req[2]);
    req[req[2]] = (uint8_t)(cs >> 8); req[req[2] + 1] = (uint8_t)cs;
    return (size_t)req[2] + 2;
}

static size_t send(rdm_responder_t *r, const uint8_t dest[6], uint8_t cc, uint16_t pid, const uint8_t *pd, uint8_t pdl)
{
    size_t n = build(dest, cc, pid, pd, pdl, 0);
    memset(resp, 0xEE, sizeof resp);
    return rdm_responder_handle(r, req, n, resp);
}

/* Tjekker at et almindeligt svar er velformet og hører til forespørgslen. */
static void check_response_frame(size_t len, uint8_t cc, uint16_t pid, uint8_t rtype)
{
    CHECK(len >= RDM_HEADER_LEN + 2);
    CHECK(resp[0] == SC_RDM && resp[1] == SC_SUB_MESSAGE);
    CHECK(resp[2] + 2u == len);
    CHECK(memcmp(resp + 3, CTRL_UID, 6) == 0);     /* dest = controller */
    CHECK(memcmp(resp + 9, MY_UID, 6) == 0);       /* src = os */
    CHECK(resp[15] == tn);                         /* samme transaction number */
    CHECK(resp[16] == rtype);
    CHECK(resp[17] == 0);                          /* message count */
    CHECK(resp[20] == (cc | 1));
    CHECK(((resp[21] << 8) | resp[22]) == pid);
    CHECK(resp[23] == resp[2] - RDM_HEADER_LEN);
    uint16_t cs = rdm_checksum(resp, resp[2]);
    CHECK(resp[resp[2]] == (cs >> 8) && resp[resp[2] + 1] == (cs & 0xFF));
}
static uint16_t nack_reason(void) { return (uint16_t)((resp[24] << 8) | resp[25]); }
static const uint8_t *pd(void) { return resp + 24; }

int main(void)
{
    rdm_responder_t r;
    size_t n;

    SECTION("init");
    rdm_responder_init(&r, &desc, NULL);
    CHECK(r.settings.dmx_start_address == 1 && r.settings.personality == 1 && r.settings.curve == 1);
    CHECK(rdm_responder_footprint(&r) == 4);
    CHECK(rdm_responder_max_start_address(&r) == 509);
    rdm_settings_t bad = { .dmx_start_address = 600, .personality = 9, .curve = 0, .device_label_len = 99 };
    rdm_responder_init(&r, &desc, &bad);
    CHECK(r.settings.dmx_start_address == 1 && r.settings.personality == 1 && r.settings.curve == 1 && r.settings.device_label_len == 0);
    rdm_settings_t ok = { .dmx_start_address = 100, .personality = 2, .curve = 3, .device_label_len = 3, .device_label = "Abc" };
    rdm_responder_init(&r, &desc, &ok);
    CHECK(r.settings.dmx_start_address == 100 && r.settings.personality == 2 && r.settings.curve == 3);
    rdm_responder_init(&r, &desc, NULL);

    SECTION("pakker der skal ignoreres");
    n = build(MY_UID, GET_COMMAND, DEVICE_INFO, NULL, 0, 0); req[n - 1] ^= 0xFF;   /* ødelagt checksum */
    CHECK(rdm_responder_handle(&r, req, n, resp) == 0);
    n = build(MY_UID, GET_COMMAND, DEVICE_INFO, NULL, 0, 0);
    CHECK(rdm_responder_handle(&r, req, n - 1, resp) == 0);                          /* afkortet */
    CHECK(rdm_responder_handle(&r, req, 10, resp) == 0);
    { uint8_t other[6] = { 0x7F, 0xF0, 0, 0, 0, 0x43 };
      CHECK(send(&r, other, GET_COMMAND, DEVICE_INFO, NULL, 0) == 0); }             /* anden enhed */
    { uint8_t other[6] = { 0x12, 0x34, 0xFF, 0xFF, 0xFF, 0xFF };
      CHECK(send(&r, other, GET_COMMAND, DEVICE_INFO, NULL, 0) == 0); }             /* fremmed vendorcast */
    CHECK(send(&r, BCAST, GET_COMMAND, DEVICE_INFO, NULL, 0) == 0);                  /* GET til broadcast: intet svar */
    n = build(MY_UID, GET_COMMAND_RESPONSE, DEVICE_INFO, NULL, 0, 0);
    CHECK(rdm_responder_handle(&r, req, n, resp) == 0);                              /* svar-CC ignoreres */
    n = build(MY_UID, GET_COMMAND, DEVICE_INFO, NULL, 0, 0); req[1] = 0x02;
    { uint16_t cs = rdm_checksum(req, req[2]); req[req[2]] = (uint8_t)(cs >> 8); req[req[2] + 1] = (uint8_t)cs; }
    CHECK(rdm_responder_handle(&r, req, n, resp) == 0);                              /* forkert sub start code */

    SECTION("discovery: DUB");
    uint8_t range[12];
    memset(range, 0x00, 6); memset(range + 6, 0xFF, 6); range[6] = 0x7F; range[7] = 0xFF; /* 0000:.. – 7FFF:FFFFFFFF */
    n = send(&r, BCAST, DISCOVERY_COMMAND, DISC_UNIQUE_BRANCH, range, 12);
    CHECK(n == 24);
    for (int i = 0; i < 7; i++) CHECK(resp[i] == 0xFE);
    CHECK(resp[7] == 0xAA);
    /* kodet UID: (b|0xAA),(b|0x55) — afkod og sammenlign */
    uint8_t decoded[6]; uint16_t sum = 0;
    for (int i = 0; i < 6; i++) { decoded[i] = resp[8 + 2 * i] & resp[9 + 2 * i]; sum = (uint16_t)(sum + resp[8 + 2 * i] + resp[9 + 2 * i]); }
    CHECK(memcmp(decoded, MY_UID, 6) == 0);
    CHECK((resp[20] & resp[21]) == (sum >> 8) && (resp[22] & resp[23]) == (sum & 0xFF));
    /* snævert område der rammer præcis os */
    memcpy(range, MY_UID, 6); memcpy(range + 6, MY_UID, 6);
    CHECK(send(&r, BCAST, DISCOVERY_COMMAND, DISC_UNIQUE_BRANCH, range, 12) == 24);
    /* område under os */
    memset(range, 0, 6); memcpy(range + 6, MY_UID, 6); range[11] = 0x41;
    CHECK(send(&r, BCAST, DISCOVERY_COMMAND, DISC_UNIQUE_BRANCH, range, 12) == 0);
    /* område over os */
    memcpy(range, MY_UID, 6); range[5] = 0x43; memset(range + 6, 0xFF, 6);
    CHECK(send(&r, BCAST, DISCOVERY_COMMAND, DISC_UNIQUE_BRANCH, range, 12) == 0);
    /* forkert PDL */
    memset(range, 0, 6); memset(range + 6, 0xFF, 6);
    CHECK(send(&r, BCAST, DISCOVERY_COMMAND, DISC_UNIQUE_BRANCH, range, 11) == 0);

    SECTION("discovery: mute / unmute");
    n = send(&r, MY_UID, DISCOVERY_COMMAND, DISC_MUTE, NULL, 0);
    check_response_frame(n, DISCOVERY_COMMAND, DISC_MUTE, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 2 && pd()[0] == 0 && pd()[1] == 0);
    CHECK(r.muted);
    memset(range, 0, 6); memset(range + 6, 0xFF, 6);
    CHECK(send(&r, BCAST, DISCOVERY_COMMAND, DISC_UNIQUE_BRANCH, range, 12) == 0);   /* muted: tavs */
    CHECK(send(&r, BCAST, DISCOVERY_COMMAND, DISC_UN_MUTE, NULL, 0) == 0);           /* broadcast unmute: udføres, intet svar */
    CHECK(!r.muted);
    CHECK(send(&r, BCAST, DISCOVERY_COMMAND, DISC_UNIQUE_BRANCH, range, 12) == 24);
    n = send(&r, MY_UID, DISCOVERY_COMMAND, DISC_UN_MUTE, NULL, 0);
    check_response_frame(n, DISCOVERY_COMMAND, DISC_UN_MUTE, RESPONSE_TYPE_ACK);
    n = send(&r, MY_UID, DISCOVERY_COMMAND, DISC_MUTE, range, 1);
    check_response_frame(n, DISCOVERY_COMMAND, DISC_MUTE, RESPONSE_TYPE_NACK_REASON);
    CHECK(nack_reason() == NR_FORMAT_ERROR);
    CHECK(send(&r, MY_UID, DISCOVERY_COMMAND, 0x0099, NULL, 0) == 0);               /* ukendt discovery-PID: tavs */

    SECTION("DEVICE_INFO");
    n = send(&r, MY_UID, GET_COMMAND, DEVICE_INFO, NULL, 0);
    check_response_frame(n, GET_COMMAND, DEVICE_INFO, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 19);
    CHECK(pd()[0] == 0x01 && pd()[1] == 0x00);                 /* protocol 1.0 */
    CHECK(pd()[2] == 0x00 && pd()[3] == 0x01);                 /* model id */
    CHECK(pd()[4] == 0x03 && pd()[5] == 0x08);                 /* DC PWM dimmer */
    CHECK(pd()[6] == 0 && pd()[7] == 1 && pd()[8] == 0 && pd()[9] == 0);
    CHECK(pd()[10] == 0 && pd()[11] == 4);                     /* footprint 4 */
    CHECK(pd()[12] == 1 && pd()[13] == 2);                     /* personlighed 1 af 2 */
    CHECK(pd()[14] == 0 && pd()[15] == 1);                     /* startadresse 1 */
    CHECK(pd()[16] == 0 && pd()[17] == 0);                     /* sub devices */
    CHECK(pd()[18] == 2);                                      /* sensorer */
    n = send(&r, MY_UID, SET_COMMAND, DEVICE_INFO, NULL, 0);
    check_response_frame(n, SET_COMMAND, DEVICE_INFO, RESPONSE_TYPE_NACK_REASON);
    CHECK(nack_reason() == NR_UNSUPPORTED_COMMAND_CLASS);
    n = send(&r, MY_UID, GET_COMMAND, DEVICE_INFO, range, 1);
    CHECK(nack_reason() == NR_FORMAT_ERROR);

    SECTION("tekst-PIDs");
    n = send(&r, MY_UID, GET_COMMAND, MANUFACTURER_LABEL, NULL, 0);
    check_response_frame(n, GET_COMMAND, MANUFACTURER_LABEL, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 6 && memcmp(pd(), "TPixel", 6) == 0);
    n = send(&r, MY_UID, GET_COMMAND, DEVICE_MODEL_DESCRIPTION, NULL, 0);
    CHECK(resp[23] == 7 && memcmp(pd(), "Daemper", 7) == 0);
    n = send(&r, MY_UID, GET_COMMAND, SOFTWARE_VERSION_LABEL, NULL, 0);
    CHECK(resp[23] == 5 && memcmp(pd(), "1.0.0", 5) == 0);

    SECTION("DEVICE_LABEL");
    n = send(&r, MY_UID, GET_COMMAND, DEVICE_LABEL, NULL, 0);
    check_response_frame(n, GET_COMMAND, DEVICE_LABEL, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 0);
    settings_calls = 0;
    n = send(&r, MY_UID, SET_COMMAND, DEVICE_LABEL, (const uint8_t *)"Kokken lampe", 12);
    check_response_frame(n, SET_COMMAND, DEVICE_LABEL, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 0 && settings_calls == 1);
    n = send(&r, MY_UID, GET_COMMAND, DEVICE_LABEL, NULL, 0);
    CHECK(resp[23] == 12 && memcmp(pd(), "Kokken lampe", 12) == 0);
    { uint8_t big[40]; memset(big, 'x', sizeof big);
      n = send(&r, MY_UID, SET_COMMAND, DEVICE_LABEL, big, 33);
      CHECK(nack_reason() == NR_FORMAT_ERROR);
      n = send(&r, MY_UID, SET_COMMAND, DEVICE_LABEL, big, 32);
      CHECK(resp[16] == RESPONSE_TYPE_ACK && r.settings.device_label_len == 32); }
    /* broadcast SET: udføres, intet svar */
    CHECK(send(&r, BCAST, SET_COMMAND, DEVICE_LABEL, (const uint8_t *)"Alle", 4) == 0);
    CHECK(r.settings.device_label_len == 4 && memcmp(r.settings.device_label, "Alle", 4) == 0);
    CHECK(send(&r, VCAST, SET_COMMAND, DEVICE_LABEL, (const uint8_t *)"V", 1) == 0);
    CHECK(r.settings.device_label_len == 1);

    SECTION("DMX_START_ADDRESS");
    n = send(&r, MY_UID, GET_COMMAND, DMX_START_ADDRESS, NULL, 0);
    check_response_frame(n, GET_COMMAND, DMX_START_ADDRESS, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 2 && pd()[0] == 0 && pd()[1] == 1);
    { uint8_t a[2] = { 0x01, 0x2C }; settings_calls = 0;              /* 300 */
      n = send(&r, MY_UID, SET_COMMAND, DMX_START_ADDRESS, a, 2);
      check_response_frame(n, SET_COMMAND, DMX_START_ADDRESS, RESPONSE_TYPE_ACK);
      CHECK(resp[23] == 0 && r.settings.dmx_start_address == 300 && settings_calls == 1);
      a[0] = 0x01; a[1] = 0xFD;                                          /* 509 = max ved footprint 4 */
      n = send(&r, MY_UID, SET_COMMAND, DMX_START_ADDRESS, a, 2);
      CHECK(resp[16] == RESPONSE_TYPE_ACK && r.settings.dmx_start_address == 509);
      a[1] = 0xFE;                                                       /* 510: for højt */
      n = send(&r, MY_UID, SET_COMMAND, DMX_START_ADDRESS, a, 2);
      CHECK(resp[16] == RESPONSE_TYPE_NACK_REASON && nack_reason() == NR_DATA_OUT_OF_RANGE && r.settings.dmx_start_address == 509);
      a[0] = 0; a[1] = 0;
      n = send(&r, MY_UID, SET_COMMAND, DMX_START_ADDRESS, a, 2);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE);
      n = send(&r, MY_UID, SET_COMMAND, DMX_START_ADDRESS, a, 1);
      CHECK(nack_reason() == NR_FORMAT_ERROR);
      a[0] = 0; a[1] = 10;
      CHECK(send(&r, BCAST, SET_COMMAND, DMX_START_ADDRESS, a, 2) == 0);
      CHECK(r.settings.dmx_start_address == 10); }

    SECTION("DMX_PERSONALITY");
    n = send(&r, MY_UID, GET_COMMAND, DMX_PERSONALITY, NULL, 0);
    check_response_frame(n, GET_COMMAND, DMX_PERSONALITY, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 2 && pd()[0] == 1 && pd()[1] == 2);
    { uint8_t p = 2;
      n = send(&r, MY_UID, SET_COMMAND, DMX_PERSONALITY, &p, 1);
      CHECK(resp[16] == RESPONSE_TYPE_ACK && r.settings.personality == 2 && rdm_responder_footprint(&r) == 8);
      p = 3;
      n = send(&r, MY_UID, SET_COMMAND, DMX_PERSONALITY, &p, 1);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE && r.settings.personality == 2);
      /* startadresse klemmes når footprint vokser */
      uint8_t a[2] = { 0x01, 0xFD }; p = 1;
      send(&r, MY_UID, SET_COMMAND, DMX_PERSONALITY, &p, 1);
      send(&r, MY_UID, SET_COMMAND, DMX_START_ADDRESS, a, 2);
      CHECK(r.settings.dmx_start_address == 509);
      p = 2; send(&r, MY_UID, SET_COMMAND, DMX_PERSONALITY, &p, 1);
      CHECK(r.settings.dmx_start_address == 505);
      p = 2;
      n = send(&r, MY_UID, GET_COMMAND, DMX_PERSONALITY_DESCRIPTION, &p, 1);
      check_response_frame(n, GET_COMMAND, DMX_PERSONALITY_DESCRIPTION, RESPONSE_TYPE_ACK);
      CHECK(pd()[0] == 2 && pd()[1] == 0 && pd()[2] == 8 && resp[23] == 3 + 16 && memcmp(pd() + 3, "4 kanaler 16-bit", 16) == 0);
      p = 0;
      n = send(&r, MY_UID, GET_COMMAND, DMX_PERSONALITY_DESCRIPTION, &p, 1);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE);
      p = 1; send(&r, MY_UID, SET_COMMAND, DMX_PERSONALITY, &p, 1); }

    SECTION("IDENTIFY_DEVICE");
    identify_calls = 0;
    n = send(&r, MY_UID, GET_COMMAND, IDENTIFY_DEVICE, NULL, 0);
    CHECK(resp[23] == 1 && pd()[0] == 0);
    { uint8_t on = 1;
      n = send(&r, MY_UID, SET_COMMAND, IDENTIFY_DEVICE, &on, 1);
      check_response_frame(n, SET_COMMAND, IDENTIFY_DEVICE, RESPONSE_TYPE_ACK);
      CHECK(resp[23] == 0 && identify_calls == 1 && last_identify && r.identifying);
      n = send(&r, MY_UID, GET_COMMAND, IDENTIFY_DEVICE, NULL, 0);
      CHECK(pd()[0] == 1);
      on = 2;
      n = send(&r, MY_UID, SET_COMMAND, IDENTIFY_DEVICE, &on, 1);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE && r.identifying);
      on = 0;
      CHECK(send(&r, BCAST, SET_COMMAND, IDENTIFY_DEVICE, &on, 1) == 0);
      CHECK(!r.identifying && identify_calls == 2 && !last_identify); }

    SECTION("SUPPORTED_PARAMETERS");
    n = send(&r, MY_UID, GET_COMMAND, SUPPORTED_PARAMETERS, NULL, 0);
    check_response_frame(n, GET_COMMAND, SUPPORTED_PARAMETERS, RESPONSE_TYPE_ACK);
    CHECK(resp[23] % 2 == 0);
    { bool has_curve = false, has_sensor = false, has_label = false, has_disc = false;
      for (int i = 0; i < resp[23]; i += 2) {
          uint16_t p = (uint16_t)((pd()[i] << 8) | pd()[i + 1]);
          if (p == CURVE) has_curve = true;
          if (p == SENSOR_VALUE) has_sensor = true;
          if (p == DEVICE_LABEL) has_label = true;
          if (p == DISC_UNIQUE_BRANCH || p == DEVICE_INFO || p == DMX_START_ADDRESS) has_disc = true;
      }
      CHECK(has_curve && has_sensor && has_label && !has_disc); }

    SECTION("CURVE / CURVE_DESCRIPTION / DIMMER_INFO");
    n = send(&r, MY_UID, GET_COMMAND, CURVE, NULL, 0);
    check_response_frame(n, GET_COMMAND, CURVE, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 2 && pd()[0] == 1 && pd()[1] == 3);
    { uint8_t k = 3; settings_calls = 0;
      n = send(&r, MY_UID, SET_COMMAND, CURVE, &k, 1);
      CHECK(resp[16] == RESPONSE_TYPE_ACK && r.settings.curve == 3 && settings_calls == 1);
      k = 4;
      n = send(&r, MY_UID, SET_COMMAND, CURVE, &k, 1);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE && r.settings.curve == 3);
      k = 2;
      n = send(&r, MY_UID, GET_COMMAND, CURVE_DESCRIPTION, &k, 1);
      check_response_frame(n, GET_COMMAND, CURVE_DESCRIPTION, RESPONSE_TYPE_ACK);
      CHECK(pd()[0] == 2 && resp[23] == 1 + 10 && memcmp(pd() + 1, "Kvadratisk", 10) == 0);
      n = send(&r, MY_UID, GET_COMMAND, CURVE_DESCRIPTION, NULL, 0);
      CHECK(nack_reason() == NR_FORMAT_ERROR); }
    n = send(&r, MY_UID, GET_COMMAND, DIMMER_INFO, NULL, 0);
    check_response_frame(n, GET_COMMAND, DIMMER_INFO, RESPONSE_TYPE_ACK);
    CHECK(resp[23] == 11 && pd()[8] == 3 && pd()[9] == 8 && pd()[10] == 0);

    SECTION("sensorer");
    fake_temp = 250; fake_volt = 120;
    rdm_responder_sample_sensors(&r);
    fake_temp = 310; rdm_responder_sample_sensors(&r);
    fake_temp = 270; rdm_responder_sample_sensors(&r);
    { uint8_t s = 0;
      n = send(&r, MY_UID, GET_COMMAND, SENSOR_DEFINITION, &s, 1);
      check_response_frame(n, GET_COMMAND, SENSOR_DEFINITION, RESPONSE_TYPE_ACK);
      CHECK(pd()[0] == 0 && pd()[1] == SENS_TEMPERATURE && pd()[2] == UNITS_CENTIGRADE && pd()[3] == PREFIX_DECI);
      CHECK(pd()[4] == 0xFF && pd()[5] == 0x38);                /* -200 */
      CHECK(pd()[6] == 0x03 && pd()[7] == 0xE8);                /* 1000 */
      CHECK(pd()[10] == 0x02 && pd()[11] == 0xBC);              /* normal max 700 */
      CHECK(pd()[12] == SENSOR_LOWEST_HIGHEST);
      CHECK(resp[23] == 13 + 10 && memcmp(pd() + 13, "Temperatur", 10) == 0);
      n = send(&r, MY_UID, GET_COMMAND, SENSOR_VALUE, &s, 1);
      check_response_frame(n, GET_COMMAND, SENSOR_VALUE, RESPONSE_TYPE_ACK);
      CHECK(resp[23] == 9 && pd()[0] == 0);
      CHECK(pd()[1] == 0x01 && pd()[2] == 0x0E);                /* present 270 */
      CHECK(pd()[3] == 0x00 && pd()[4] == 0xFA);                /* lowest 250 */
      CHECK(pd()[5] == 0x01 && pd()[6] == 0x36);                /* highest 310 */
      CHECK(pd()[7] == 0 && pd()[8] == 0);
      s = 1;
      n = send(&r, MY_UID, GET_COMMAND, SENSOR_VALUE, &s, 1);
      CHECK(pd()[1] == 0 && pd()[2] == 120);
      s = 2;
      n = send(&r, MY_UID, GET_COMMAND, SENSOR_VALUE, &s, 1);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE);
      n = send(&r, MY_UID, GET_COMMAND, SENSOR_DEFINITION, &s, 1);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE);
      /* SET nulstiller lavest/højest */
      s = 0;
      n = send(&r, MY_UID, SET_COMMAND, SENSOR_VALUE, &s, 1);
      check_response_frame(n, SET_COMMAND, SENSOR_VALUE, RESPONSE_TYPE_ACK);
      CHECK(resp[23] == 9 && pd()[3] == 0x01 && pd()[4] == 0x0E && pd()[5] == 0x01 && pd()[6] == 0x0E);
      fake_temp = 100; rdm_responder_sample_sensors(&r);
      s = 0xFF;
      n = send(&r, MY_UID, SET_COMMAND, SENSOR_VALUE, &s, 1);
      CHECK(resp[16] == RESPONSE_TYPE_ACK && resp[23] == 0 && r.sensor_stats[0].lowest == 100 && r.sensor_stats[0].highest == 100); }

    SECTION("fejl-tilfaelde");
    n = send(&r, MY_UID, GET_COMMAND, 0x8123, NULL, 0);
    check_response_frame(n, GET_COMMAND, 0x8123, RESPONSE_TYPE_NACK_REASON);
    CHECK(nack_reason() == NR_UNKNOWN_PID);
    n = build(MY_UID, GET_COMMAND, DEVICE_INFO, NULL, 0, 1);
    n = rdm_responder_handle(&r, req, n, resp);
    check_response_frame(n, GET_COMMAND, DEVICE_INFO, RESPONSE_TYPE_NACK_REASON);
    CHECK(nack_reason() == NR_SUB_DEVICE_OUT_OF_RANGE && resp[18] == 0 && resp[19] == 1);
    n = send(&r, MY_UID, GET_COMMAND, RESET_DEVICE, NULL, 0);
    CHECK(nack_reason() == NR_UNSUPPORTED_COMMAND_CLASS);
    /* maksimal PDL må ikke sprænge bufferen */
    { uint8_t big[231]; memset(big, 1, sizeof big);
      n = send(&r, MY_UID, SET_COMMAND, DEVICE_LABEL, big, 231);
      CHECK(n == 28 && nack_reason() == NR_FORMAT_ERROR); }

    SECTION("enhed uden kurver og sensorer");
    { rdm_device_desc_t plain = desc; plain.curve_count = 0; plain.sensor_count = 0;
      rdm_responder_t r2; rdm_responder_init(&r2, &plain, NULL);
      n = send(&r2, MY_UID, GET_COMMAND, CURVE, NULL, 0);
      CHECK(nack_reason() == NR_UNKNOWN_PID);
      n = send(&r2, MY_UID, GET_COMMAND, SENSOR_VALUE, range, 1);
      CHECK(nack_reason() == NR_UNKNOWN_PID);
      n = send(&r2, MY_UID, GET_COMMAND, DEVICE_INFO, NULL, 0);
      CHECK(pd()[18] == 0);
      n = send(&r2, MY_UID, GET_COMMAND, SUPPORTED_PARAMETERS, NULL, 0);
      for (int i = 0; i < resp[23]; i += 2) {
          uint16_t p = (uint16_t)((pd()[i] << 8) | pd()[i + 1]);
          CHECK(p != CURVE && p != SENSOR_VALUE && p != DIMMER_INFO);
      } }

    SECTION("RESET_DEVICE");
    reset_calls = 0; r.muted = true; r.identifying = true;
    { uint8_t w = RESET_WARM;
      n = send(&r, MY_UID, SET_COMMAND, RESET_DEVICE, &w, 1);
      check_response_frame(n, SET_COMMAND, RESET_DEVICE, RESPONSE_TYPE_ACK);
      CHECK(reset_calls == 1 && !last_reset_cold && !r.muted && !r.identifying);
      w = RESET_COLD;
      n = send(&r, MY_UID, SET_COMMAND, RESET_DEVICE, &w, 1);
      CHECK(reset_calls == 2 && last_reset_cold);
      w = 0x02;
      n = send(&r, MY_UID, SET_COMMAND, RESET_DEVICE, &w, 1);
      CHECK(nack_reason() == NR_DATA_OUT_OF_RANGE && reset_calls == 2); }

    printf("\n%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}
