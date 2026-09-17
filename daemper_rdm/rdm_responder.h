/*
 * rdm_responder.h — transport-uafhængig RDM-responder til en DMX-dæmper.
 *
 * Kernen kender intet til TimoTwo, SPI eller Arduino. Den får en rå
 * RDM-pakke ind (fra start code 0xCC til og med checksum) og leverer en rå
 * svar-pakke tilbage. Alt der er hardware-specifikt (gem indstillinger,
 * blink ved identify, læs sensorer, opdatér DMX-vindue) sker via callbacks
 * i rdm_device_desc_t.
 *
 * Kan compiles med enhver C99-compiler, så den kan unit-testes på en Mac
 * (se test/) uafhængigt af dæmperens hardware.
 */
#ifndef RDM_RESPONDER_H_
#define RDM_RESPONDER_H_

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "e120.h"

#ifdef __cplusplus
extern "C" {
#endif

#define RDM_LABEL_MAX          32
#define RDM_MAX_SENSORS        8
#define RDM_MAX_PERSONALITIES  8
#define RDM_MAX_CURVES         8

typedef struct {
    uint16_t manufacturer;   /* ESTA manufacturer ID */
    uint32_t device;         /* unikt device ID under producenten */
} rdm_uid_t;

/* Én DMX-personlighed (fx "4 kanaler 8-bit" eller "4 kanaler 16-bit"). */
typedef struct {
    const char *description;    /* max 32 tegn */
    uint16_t    footprint;      /* antal DMX-kanaler */
    uint8_t     resolution_bits;/* 8 eller 16 bit pr. udgang (bruges i DIMMER_INFO) */
} rdm_personality_t;

/* Én sensor (temperatur, spænding, ...). read() leverer den aktuelle værdi
 * i enheden angivet af unit+prefix, fx PREFIX_DECI + UNITS_CENTIGRADE = 0,1 °C. */
typedef struct {
    uint8_t     type;        /* SENS_* */
    uint8_t     unit;        /* UNITS_* */
    uint8_t     prefix;      /* PREFIX_* */
    int16_t     range_min, range_max;
    int16_t     normal_min, normal_max;
    const char *description; /* max 32 tegn */
    int16_t   (*read)(void *ctx);
} rdm_sensor_def_t;

/* Statisk beskrivelse af enheden. Udfyldes én gang i firmwaren. */
typedef struct {
    rdm_uid_t   uid;
    uint16_t    device_model_id;
    uint16_t    product_category;          /* PRODUCT_CATEGORY_* */
    uint32_t    software_version_id;
    const char *software_version_label;    /* max 32 */
    const char *manufacturer_label;        /* max 32 */
    const char *device_model_description;  /* max 32 */

    const rdm_personality_t *personalities;
    uint8_t     personality_count;         /* 1..RDM_MAX_PERSONALITIES */

    const char *const *curves;             /* dimmer-kurver, max 32 tegn hver */
    uint8_t     curve_count;               /* 0 = ingen kurve-PIDs annonceres */

    const rdm_sensor_def_t *sensors;
    uint8_t     sensor_count;              /* 0..RDM_MAX_SENSORS */

    /* Callbacks — alle må være NULL. */
    void *ctx;
    void (*on_settings_changed)(void *ctx); /* adresse/personlighed/kurve/label ændret: gem + opdatér DMX-vindue */
    void (*on_identify)(void *ctx, bool on);
    void (*on_reset)(void *ctx, bool cold);
} rdm_device_desc_t;

/* Indstillinger der overlever strømsvigt. Firmwaren gemmer/indlæser dem. */
typedef struct {
    uint16_t dmx_start_address;        /* 1..512 */
    uint8_t  personality;              /* 1-baseret */
    uint8_t  curve;                    /* 1-baseret, ignoreres hvis curve_count == 0 */
    uint8_t  device_label_len;
    char     device_label[RDM_LABEL_MAX];
} rdm_settings_t;

typedef struct {
    bool    valid;
    int16_t present, lowest, highest;
} rdm_sensor_stats_t;

typedef struct {
    const rdm_device_desc_t *desc;
    rdm_settings_t settings;
    bool muted;
    bool identifying;
    rdm_sensor_stats_t sensor_stats[RDM_MAX_SENSORS];
} rdm_responder_t;

/* Initialiserer responderen. initial må være NULL (giver adresse 1, personlighed 1, kurve 1). */
void rdm_responder_init(rdm_responder_t *r, const rdm_device_desc_t *desc, const rdm_settings_t *initial);

/* Antal DMX-kanaler for den aktive personlighed. */
uint16_t rdm_responder_footprint(const rdm_responder_t *r);

/* Højeste gyldige startadresse for den aktive personlighed (513 - footprint). */
uint16_t rdm_responder_max_start_address(const rdm_responder_t *r);

/*
 * Behandler én RDM-forespørgsel.
 *   in/in_len : rå pakke fra start code 0xCC til og med de 2 checksum-bytes
 *   out       : buffer med plads til mindst RDM_MAX_PACKET bytes
 * Returnerer længden af svaret der skal sendes, eller 0 hvis der ikke skal
 * svares (ikke til os, broadcast, ugyldig checksum, DUB uden for område...).
 * Ved DISC_UNIQUE_BRANCH er svaret den 24-byte kodede DUB-pakke uden start code.
 */
size_t rdm_responder_handle(rdm_responder_t *r, const uint8_t *in, size_t in_len, uint8_t *out);

/* Læser alle sensorer én gang og opdaterer lavest/højest. Kald fx hvert sekund. */
void rdm_responder_sample_sensors(rdm_responder_t *r);

/* Hjælpere til firmware/tests */
uint16_t rdm_checksum(const uint8_t *msg, size_t message_length);
void     rdm_uid_to_bytes(const rdm_uid_t *uid, uint8_t out[6]);
void     rdm_uid_from_bytes(const uint8_t in[6], rdm_uid_t *uid);

#ifdef __cplusplus
}
#endif

#endif /* RDM_RESPONDER_H_ */
