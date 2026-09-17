/*
 * rdm_responder.c — se rdm_responder.h.
 *
 * Alle multi-byte felter i RDM er big-endian (network byte order). Vi
 * arbejder direkte på byte-bufferen med rd16/wr16 i stedet for packed
 * structs, så koden er ens på AVR, RP2040, ESP32 og på en Mac i test.
 */
#include "rdm_responder.h"
#include <string.h>

/* ------------------------------------------------------------------ */
/* Små hjælpere                                                        */
/* ------------------------------------------------------------------ */

static uint16_t rd16(const uint8_t *p) { return (uint16_t)((p[0] << 8) | p[1]); }
static void wr16(uint8_t *p, uint16_t v) { p[0] = (uint8_t)(v >> 8); p[1] = (uint8_t)v; }
static void wr32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; }

static size_t bounded_strlen(const char *s, size_t max)
{
    size_t n = 0;
    if (!s) return 0;
    while (n < max && s[n]) n++;
    return n;
}

uint16_t rdm_checksum(const uint8_t *msg, size_t message_length)
{
    uint16_t sum = 0;
    for (size_t i = 0; i < message_length; i++) sum = (uint16_t)(sum + msg[i]);
    return sum;
}

void rdm_uid_to_bytes(const rdm_uid_t *uid, uint8_t out[6])
{
    wr16(out, uid->manufacturer);
    wr32(out + 2, uid->device);
}

void rdm_uid_from_bytes(const uint8_t in[6], rdm_uid_t *uid)
{
    uid->manufacturer = rd16(in);
    uid->device = ((uint32_t)in[2] << 24) | ((uint32_t)in[3] << 16) | ((uint32_t)in[4] << 8) | in[5];
}

static int uid_cmp(const rdm_uid_t *a, const rdm_uid_t *b)
{
    if (a->manufacturer != b->manufacturer) return a->manufacturer < b->manufacturer ? -1 : 1;
    if (a->device != b->device) return a->device < b->device ? -1 : 1;
    return 0;
}

/* ------------------------------------------------------------------ */
/* Init og tilstand                                                    */
/* ------------------------------------------------------------------ */

void rdm_responder_init(rdm_responder_t *r, const rdm_device_desc_t *desc, const rdm_settings_t *initial)
{
    memset(r, 0, sizeof(*r));
    r->desc = desc;
    if (initial) {
        r->settings = *initial;
    } else {
        r->settings.dmx_start_address = 1;
        r->settings.personality = 1;
        r->settings.curve = 1;
    }
    /* Ryd op i ugyldige gemte værdier (fx tom EEPROM). */
    if (r->settings.personality < 1 || r->settings.personality > desc->personality_count)
        r->settings.personality = 1;
    if (desc->curve_count == 0)
        r->settings.curve = 1;
    else if (r->settings.curve < 1 || r->settings.curve > desc->curve_count)
        r->settings.curve = 1;
    if (r->settings.dmx_start_address < 1 || r->settings.dmx_start_address > rdm_responder_max_start_address(r))
        r->settings.dmx_start_address = 1;
    if (r->settings.device_label_len > RDM_LABEL_MAX)
        r->settings.device_label_len = 0;
}

uint16_t rdm_responder_footprint(const rdm_responder_t *r)
{
    const rdm_device_desc_t *d = r->desc;
    if (d->personality_count == 0) return 0;
    uint8_t p = r->settings.personality;
    if (p < 1 || p > d->personality_count) p = 1;
    return d->personalities[p - 1].footprint;
}

uint16_t rdm_responder_max_start_address(const rdm_responder_t *r)
{
    uint16_t fp = rdm_responder_footprint(r);
    if (fp == 0 || fp > 512) return 1;
    return (uint16_t)(513 - fp);
}

void rdm_responder_sample_sensors(rdm_responder_t *r)
{
    const rdm_device_desc_t *d = r->desc;
    for (uint8_t i = 0; i < d->sensor_count && i < RDM_MAX_SENSORS; i++) {
        if (!d->sensors[i].read) continue;
        int16_t v = d->sensors[i].read(d->ctx);
        rdm_sensor_stats_t *s = &r->sensor_stats[i];
        s->present = v;
        if (!s->valid) {
            s->lowest = s->highest = v;
            s->valid = true;
        } else {
            if (v < s->lowest) s->lowest = v;
            if (v > s->highest) s->highest = v;
        }
    }
}

static void settings_changed(rdm_responder_t *r)
{
    if (r->desc->on_settings_changed) r->desc->on_settings_changed(r->desc->ctx);
}

/* ------------------------------------------------------------------ */
/* Svar-opbygning                                                      */
/* ------------------------------------------------------------------ */

/* Arbejdskontekst for én forespørgsel. */
typedef struct {
    const uint8_t *in;
    uint8_t cc;          /* GET_COMMAND / SET_COMMAND / DISCOVERY_COMMAND */
    uint16_t pid;
    uint8_t pdl;
    const uint8_t *pd;
    bool broadcast;      /* svar må ikke sendes (undtagen DUB) */

    uint8_t *out;        /* svar-pakke */
    uint8_t *opd;        /* peger på parameter data i svaret */
    uint8_t opdl;
    uint8_t response_type;
} rdm_ctx_t;

/* Skriver svar-headeren: bytter src/dest, kopierer TN, sætter CC|1. */
static void begin_response(rdm_responder_t *r, rdm_ctx_t *c)
{
    uint8_t *o = c->out;
    memset(o, 0, RDM_HEADER_LEN);
    o[RDM_OFF_START_CODE] = SC_RDM;
    o[RDM_OFF_SUB_START_CODE] = SC_SUB_MESSAGE;
    memcpy(o + RDM_OFF_DEST_UID, c->in + RDM_OFF_SRC_UID, 6);
    rdm_uid_to_bytes(&r->desc->uid, o + RDM_OFF_SRC_UID);
    o[RDM_OFF_TN] = c->in[RDM_OFF_TN];
    o[RDM_OFF_PORT_OR_RESP_TYPE] = RESPONSE_TYPE_ACK;
    o[RDM_OFF_MESSAGE_COUNT] = 0;
    wr16(o + RDM_OFF_SUB_DEVICE, rd16(c->in + RDM_OFF_SUB_DEVICE));
    o[RDM_OFF_CC] = (uint8_t)(c->cc | 0x01);
    wr16(o + RDM_OFF_PID, c->pid);
    c->opd = o + RDM_OFF_PD;
    c->opdl = 0;
    c->response_type = RESPONSE_TYPE_ACK;
}

static size_t finish_response(rdm_ctx_t *c)
{
    uint8_t *o = c->out;
    uint8_t mlen = (uint8_t)(RDM_HEADER_LEN + c->opdl);
    o[RDM_OFF_PORT_OR_RESP_TYPE] = c->response_type;
    o[RDM_OFF_PDL] = c->opdl;
    o[RDM_OFF_MESSAGE_LENGTH] = mlen;
    wr16(o + mlen, rdm_checksum(o, mlen));
    return (size_t)mlen + 2;
}

static void nack(rdm_ctx_t *c, uint16_t reason)
{
    c->response_type = RESPONSE_TYPE_NACK_REASON;
    wr16(c->opd, reason);
    c->opdl = 2;
}

static void ack_text(rdm_ctx_t *c, const char *text)
{
    size_t n = bounded_strlen(text, RDM_LABEL_MAX);
    memcpy(c->opd, text, n);
    c->opdl = (uint8_t)n;
}

/* Tjekker command class og PDL i ét hug. Returnerer false hvis der er NACK'et. */
static bool expect(rdm_ctx_t *c, uint8_t allowed_cc_mask, uint8_t get_pdl, uint8_t set_pdl)
{
    bool is_get = c->cc == GET_COMMAND;
    bool is_set = c->cc == SET_COMMAND;
    if ((is_get && !(allowed_cc_mask & 1)) || (is_set && !(allowed_cc_mask & 2)) || (!is_get && !is_set)) {
        nack(c, NR_UNSUPPORTED_COMMAND_CLASS);
        return false;
    }
    if (c->pdl != (is_get ? get_pdl : set_pdl)) {
        nack(c, NR_FORMAT_ERROR);
        return false;
    }
    return true;
}
#define CC_GET_ONLY 1
#define CC_SET_ONLY 2
#define CC_GET_SET  3

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

/* E1.20 §7.5: DUB-svar = 7×0xFE preamble, 0xAA separator, kodet UID (12 bytes),
 * kodet checksum (4 bytes). Hver byte b kodes som (b|0xAA),(b|0x55). */
static size_t disc_unique_branch(rdm_responder_t *r, rdm_ctx_t *c)
{
    rdm_uid_t lower, upper;
    if (c->pdl != 12 || r->muted) return 0;
    rdm_uid_from_bytes(c->pd, &lower);
    rdm_uid_from_bytes(c->pd + 6, &upper);
    if (uid_cmp(&r->desc->uid, &lower) < 0 || uid_cmp(&r->desc->uid, &upper) > 0) return 0;

    uint8_t uid[6];
    rdm_uid_to_bytes(&r->desc->uid, uid);
    uint8_t *o = c->out;
    for (int i = 0; i < 7; i++) o[i] = 0xFE;
    o[7] = 0xAA;
    uint16_t sum = 0;
    for (int i = 0; i < 6; i++) {
        o[8 + 2 * i]     = (uint8_t)(uid[i] | 0xAA);
        o[8 + 2 * i + 1] = (uint8_t)(uid[i] | 0x55);
        sum = (uint16_t)(sum + o[8 + 2 * i] + o[8 + 2 * i + 1]);
    }
    o[20] = (uint8_t)((sum >> 8) | 0xAA);
    o[21] = (uint8_t)((sum >> 8) | 0x55);
    o[22] = (uint8_t)((sum & 0xFF) | 0xAA);
    o[23] = (uint8_t)((sum & 0xFF) | 0x55);
    return RDM_DUB_RESPONSE_LEN;
}

static void disc_mute_unmute(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (c->pdl != 0) { nack(c, NR_FORMAT_ERROR); return; }
    r->muted = (c->pid == DISC_MUTE);
    /* Control field: bit0 managed proxy, bit1 sub-device, bit2 boot-loader, bit3 proxied device. Alle 0. */
    wr16(c->opd, 0x0000);
    c->opdl = 2;
}

/* ------------------------------------------------------------------ */
/* E1.20 obligatoriske og almindelige PIDs                             */
/* ------------------------------------------------------------------ */

static const uint16_t base_supported[] = {
    DEVICE_MODEL_DESCRIPTION, MANUFACTURER_LABEL, DEVICE_LABEL,
    DMX_PERSONALITY, DMX_PERSONALITY_DESCRIPTION, RESET_DEVICE,
};
static const uint16_t dimmer_supported[] = { DIMMER_INFO, CURVE, CURVE_DESCRIPTION };
static const uint16_t sensor_supported[] = { SENSOR_DEFINITION, SENSOR_VALUE };

static void supported_parameters(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_ONLY, 0, 0)) return;
    uint8_t *p = c->opd;
    for (size_t i = 0; i < sizeof base_supported / 2; i++) { wr16(p, base_supported[i]); p += 2; }
    if (r->desc->curve_count > 0)
        for (size_t i = 0; i < sizeof dimmer_supported / 2; i++) { wr16(p, dimmer_supported[i]); p += 2; }
    if (r->desc->sensor_count > 0)
        for (size_t i = 0; i < sizeof sensor_supported / 2; i++) { wr16(p, sensor_supported[i]); p += 2; }
    c->opdl = (uint8_t)(p - c->opd);
}

static void device_info(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_ONLY, 0, 0)) return;
    const rdm_device_desc_t *d = r->desc;
    uint8_t *p = c->opd;
    wr16(p + 0, RDM_PROTOCOL_VERSION);
    wr16(p + 2, d->device_model_id);
    wr16(p + 4, d->product_category);
    wr32(p + 6, d->software_version_id);
    wr16(p + 10, rdm_responder_footprint(r));
    p[12] = r->settings.personality;
    p[13] = d->personality_count;
    wr16(p + 14, rdm_responder_footprint(r) ? r->settings.dmx_start_address : 0xFFFF);
    wr16(p + 16, 0);                      /* sub devices */
    p[18] = d->sensor_count;
    c->opdl = 19;
}

static void text_get(rdm_ctx_t *c, const char *text)
{
    if (!expect(c, CC_GET_ONLY, 0, 0)) return;
    ack_text(c, text);
}

static void device_label(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (c->cc == GET_COMMAND) {
        if (!expect(c, CC_GET_SET, 0, 0)) return;
        memcpy(c->opd, r->settings.device_label, r->settings.device_label_len);
        c->opdl = r->settings.device_label_len;
    } else if (c->cc == SET_COMMAND) {
        if (c->pdl > RDM_LABEL_MAX) { nack(c, NR_FORMAT_ERROR); return; }
        r->settings.device_label_len = c->pdl;
        memcpy(r->settings.device_label, c->pd, c->pdl);
        settings_changed(r);
    } else {
        nack(c, NR_UNSUPPORTED_COMMAND_CLASS);
    }
}

static void dmx_start_address(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_SET, 0, 2)) return;
    if (c->cc == GET_COMMAND) {
        wr16(c->opd, rdm_responder_footprint(r) ? r->settings.dmx_start_address : 0xFFFF);
        c->opdl = 2;
        return;
    }
    uint16_t addr = rd16(c->pd);
    if (addr < 1 || addr > rdm_responder_max_start_address(r)) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    r->settings.dmx_start_address = addr;
    settings_changed(r);
}

static void dmx_personality(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_SET, 0, 1)) return;
    if (c->cc == GET_COMMAND) {
        c->opd[0] = r->settings.personality;
        c->opd[1] = r->desc->personality_count;
        c->opdl = 2;
        return;
    }
    uint8_t p = c->pd[0];
    if (p < 1 || p > r->desc->personality_count) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    r->settings.personality = p;
    /* Sørg for at startadressen stadig er lovlig med det nye footprint. */
    uint16_t max = rdm_responder_max_start_address(r);
    if (r->settings.dmx_start_address > max) r->settings.dmx_start_address = max;
    settings_changed(r);
}

static void dmx_personality_description(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_ONLY, 1, 0)) return;
    uint8_t p = c->pd[0];
    if (p < 1 || p > r->desc->personality_count) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    const rdm_personality_t *pers = &r->desc->personalities[p - 1];
    c->opd[0] = p;
    wr16(c->opd + 1, pers->footprint);
    size_t n = bounded_strlen(pers->description, RDM_LABEL_MAX);
    memcpy(c->opd + 3, pers->description, n);
    c->opdl = (uint8_t)(3 + n);
}

static void identify_device(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_SET, 0, 1)) return;
    if (c->cc == GET_COMMAND) {
        c->opd[0] = r->identifying ? 1 : 0;
        c->opdl = 1;
        return;
    }
    if (c->pd[0] > 1) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    r->identifying = c->pd[0] == 1;
    if (r->desc->on_identify) r->desc->on_identify(r->desc->ctx, r->identifying);
}

static void reset_device(rdm_ctx_t *c, bool *do_reset, bool *cold)
{
    if (!expect(c, CC_SET_ONLY, 0, 1)) return;
    if (c->pd[0] != RESET_WARM && c->pd[0] != RESET_COLD) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    *do_reset = true;
    *cold = c->pd[0] == RESET_COLD;
}

/* ------------------------------------------------------------------ */
/* E1.37-1 dimmer-PIDs                                                 */
/* ------------------------------------------------------------------ */

static void dimmer_info(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_ONLY, 0, 0)) return;
    uint8_t *p = c->opd;
    /* MINIMUM_LEVEL/MAXIMUM_LEVEL understøttes ikke, så alle fire grænser er 0. */
    wr16(p + 0, 0); wr16(p + 2, 0); wr16(p + 4, 0); wr16(p + 6, 0);
    p[8] = r->desc->curve_count;
    /* Levels resolution = antal bits pr. kanal i den aktive personlighed. */
    p[9] = r->desc->personalities[r->settings.personality - 1].resolution_bits;
    p[10] = 0;                                /* split levels ikke understøttet */
    c->opdl = 11;
}

static void curve(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_SET, 0, 1)) return;
    if (c->cc == GET_COMMAND) {
        c->opd[0] = r->settings.curve;
        c->opd[1] = r->desc->curve_count;
        c->opdl = 2;
        return;
    }
    uint8_t k = c->pd[0];
    if (k < 1 || k > r->desc->curve_count) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    r->settings.curve = k;
    settings_changed(r);
}

static void curve_description(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_ONLY, 1, 0)) return;
    uint8_t k = c->pd[0];
    if (k < 1 || k > r->desc->curve_count) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    c->opd[0] = k;
    size_t n = bounded_strlen(r->desc->curves[k - 1], RDM_LABEL_MAX);
    memcpy(c->opd + 1, r->desc->curves[k - 1], n);
    c->opdl = (uint8_t)(1 + n);
}

/* ------------------------------------------------------------------ */
/* Sensorer                                                            */
/* ------------------------------------------------------------------ */

static void sensor_definition(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_ONLY, 1, 0)) return;
    uint8_t n = c->pd[0];
    if (n >= r->desc->sensor_count) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    const rdm_sensor_def_t *s = &r->desc->sensors[n];
    uint8_t *p = c->opd;
    p[0] = n;
    p[1] = s->type;
    p[2] = s->unit;
    p[3] = s->prefix;
    wr16(p + 4, (uint16_t)s->range_min);
    wr16(p + 6, (uint16_t)s->range_max);
    wr16(p + 8, (uint16_t)s->normal_min);
    wr16(p + 10, (uint16_t)s->normal_max);
    p[12] = SENSOR_LOWEST_HIGHEST;
    size_t len = bounded_strlen(s->description, RDM_LABEL_MAX);
    memcpy(p + 13, s->description, len);
    c->opdl = (uint8_t)(13 + len);
}

static void write_sensor_value(rdm_responder_t *r, uint8_t n, uint8_t *p)
{
    rdm_sensor_stats_t *s = &r->sensor_stats[n];
    p[0] = n;
    wr16(p + 1, (uint16_t)s->present);
    wr16(p + 3, (uint16_t)s->lowest);
    wr16(p + 5, (uint16_t)s->highest);
    wr16(p + 7, 0);                            /* recorded value: ikke understøttet */
}

static void sensor_value(rdm_responder_t *r, rdm_ctx_t *c)
{
    if (!expect(c, CC_GET_SET, 1, 1)) return;
    uint8_t n = c->pd[0];
    if (c->cc == GET_COMMAND) {
        if (n >= r->desc->sensor_count) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
        write_sensor_value(r, n, c->opd);
        c->opdl = 9;
        return;
    }
    /* SET nulstiller lavest/højest: enten én sensor eller 0xFF = alle. */
    if (n == 0xFF) {
        for (uint8_t i = 0; i < r->desc->sensor_count && i < RDM_MAX_SENSORS; i++) {
            r->sensor_stats[i].lowest = r->sensor_stats[i].highest = r->sensor_stats[i].present;
        }
        c->opdl = 0;
        return;
    }
    if (n >= r->desc->sensor_count) { nack(c, NR_DATA_OUT_OF_RANGE); return; }
    r->sensor_stats[n].lowest = r->sensor_stats[n].highest = r->sensor_stats[n].present;
    write_sensor_value(r, n, c->opd);
    c->opdl = 9;
}

/* ------------------------------------------------------------------ */
/* Hovedindgang                                                        */
/* ------------------------------------------------------------------ */

size_t rdm_responder_handle(rdm_responder_t *r, const uint8_t *in, size_t in_len, uint8_t *out)
{
    /* 1. Grundlæggende validering af pakken. */
    if (in_len < RDM_HEADER_LEN + 2) return 0;
    if (in[RDM_OFF_START_CODE] != SC_RDM || in[RDM_OFF_SUB_START_CODE] != SC_SUB_MESSAGE) return 0;
    uint8_t mlen = in[RDM_OFF_MESSAGE_LENGTH];
    if (mlen < RDM_HEADER_LEN || (size_t)mlen + 2 > in_len) return 0;
    if (in[RDM_OFF_PDL] != mlen - RDM_HEADER_LEN) return 0;
    if (rd16(in + mlen) != rdm_checksum(in, mlen)) return 0;

    /* 2. Er den til os? Unicast, broadcast (FFFF:FFFFFFFF) eller vendorcast (vores mId:FFFFFFFF). */
    rdm_uid_t dest;
    rdm_uid_from_bytes(in + RDM_OFF_DEST_UID, &dest);
    const rdm_uid_t *me = &r->desc->uid;
    bool to_me = dest.manufacturer == me->manufacturer && dest.device == me->device;
    bool broadcast = dest.device == 0xFFFFFFFFu && (dest.manufacturer == 0xFFFF || dest.manufacturer == me->manufacturer);
    if (!to_me && !broadcast) return 0;

    rdm_ctx_t c;
    c.in = in;
    c.cc = in[RDM_OFF_CC];
    c.pid = rd16(in + RDM_OFF_PID);
    c.pdl = in[RDM_OFF_PDL];
    c.pd = in + RDM_OFF_PD;
    c.broadcast = broadcast;
    c.out = out;

    /* 3. Discovery håndteres separat: DUB har sit eget svarformat og
     *    svarer OGSÅ på broadcast; mute/unmute svarer kun på unicast. */
    if (c.cc == DISCOVERY_COMMAND) {
        if (c.pid == DISC_UNIQUE_BRANCH) return disc_unique_branch(r, &c);
        if (c.pid != DISC_MUTE && c.pid != DISC_UN_MUTE) return 0;
        begin_response(r, &c);
        disc_mute_unmute(r, &c);
        return broadcast ? 0 : finish_response(&c);
    }
    if (c.cc != GET_COMMAND && c.cc != SET_COMMAND) return 0;

    begin_response(r, &c);

    /* 4. Vi har ingen sub-devices. */
    uint16_t sub = rd16(in + RDM_OFF_SUB_DEVICE);
    if (sub != 0) {
        nack(&c, NR_SUB_DEVICE_OUT_OF_RANGE);
        return broadcast ? 0 : finish_response(&c);
    }

    bool do_reset = false, cold = false;
    const rdm_device_desc_t *d = r->desc;

    switch (c.pid) {
    case SUPPORTED_PARAMETERS:        supported_parameters(r, &c); break;
    case DEVICE_INFO:                 device_info(r, &c); break;
    case SOFTWARE_VERSION_LABEL:      text_get(&c, d->software_version_label); break;
    case DEVICE_MODEL_DESCRIPTION:    text_get(&c, d->device_model_description); break;
    case MANUFACTURER_LABEL:          text_get(&c, d->manufacturer_label); break;
    case DEVICE_LABEL:                device_label(r, &c); break;
    case DMX_START_ADDRESS:           dmx_start_address(r, &c); break;
    case DMX_PERSONALITY:             dmx_personality(r, &c); break;
    case DMX_PERSONALITY_DESCRIPTION: dmx_personality_description(r, &c); break;
    case IDENTIFY_DEVICE:             identify_device(r, &c); break;
    case RESET_DEVICE:                reset_device(&c, &do_reset, &cold); break;
    case DIMMER_INFO:
        if (d->curve_count == 0) { nack(&c, NR_UNKNOWN_PID); break; }
        dimmer_info(r, &c); break;
    case CURVE:
        if (d->curve_count == 0) { nack(&c, NR_UNKNOWN_PID); break; }
        curve(r, &c); break;
    case CURVE_DESCRIPTION:
        if (d->curve_count == 0) { nack(&c, NR_UNKNOWN_PID); break; }
        curve_description(r, &c); break;
    case SENSOR_DEFINITION:
        if (d->sensor_count == 0) { nack(&c, NR_UNKNOWN_PID); break; }
        sensor_definition(r, &c); break;
    case SENSOR_VALUE:
        if (d->sensor_count == 0) { nack(&c, NR_UNKNOWN_PID); break; }
        sensor_value(r, &c); break;
    default:
        nack(&c, NR_UNKNOWN_PID);
        break;
    }

    size_t len = broadcast ? 0 : finish_response(&c);

    /* Reset udføres efter svaret er bygget, så controlleren når at få ACK. */
    if (do_reset) {
        r->muted = false;
        r->identifying = false;
        if (d->on_reset) d->on_reset(d->ctx, cold);
    }
    return len;
}
