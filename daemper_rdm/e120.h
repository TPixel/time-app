/*
 * e120.h — konstanter fra ANSI E1.20 (RDM) og E1.37-1 (dimmer-PIDs).
 *
 * Kun de dele der bruges af daemper_rdm. Værdierne er taget fra
 * standardens tabeller (Appendix A) og er byte-for-byte som på DMX-linjen.
 */
#ifndef E120_H_
#define E120_H_

#include <stdint.h>

#define RDM_PROTOCOL_VERSION        0x0100

/* Start codes */
#define SC_RDM                      0xCC
#define SC_SUB_MESSAGE              0x01

/* Table A-1: Command classes */
#define DISCOVERY_COMMAND           0x10
#define DISCOVERY_COMMAND_RESPONSE  0x11
#define GET_COMMAND                 0x20
#define GET_COMMAND_RESPONSE        0x21
#define SET_COMMAND                 0x30
#define SET_COMMAND_RESPONSE        0x31

/* Table A-2: Response types */
#define RESPONSE_TYPE_ACK           0x00
#define RESPONSE_TYPE_ACK_TIMER     0x01
#define RESPONSE_TYPE_NACK_REASON   0x02
#define RESPONSE_TYPE_ACK_OVERFLOW  0x03

/* Table A-3: Parameter IDs (E1.20) */
#define DISC_UNIQUE_BRANCH          0x0001
#define DISC_MUTE                   0x0002
#define DISC_UN_MUTE                0x0003
#define QUEUED_MESSAGE              0x0020
#define STATUS_MESSAGES             0x0030
#define SUPPORTED_PARAMETERS        0x0050
#define PARAMETER_DESCRIPTION       0x0051
#define DEVICE_INFO                 0x0060
#define PRODUCT_DETAIL_ID_LIST      0x0070
#define DEVICE_MODEL_DESCRIPTION    0x0080
#define MANUFACTURER_LABEL          0x0081
#define DEVICE_LABEL                0x0082
#define SOFTWARE_VERSION_LABEL      0x00C0
#define DMX_PERSONALITY             0x00E0
#define DMX_PERSONALITY_DESCRIPTION 0x00E1
#define DMX_START_ADDRESS           0x00F0
#define SENSOR_DEFINITION           0x0200
#define SENSOR_VALUE                0x0201
#define RECORD_SENSORS              0x0202
#define IDENTIFY_DEVICE             0x1000
#define RESET_DEVICE                0x1001

/* E1.37-1: Dimmer message parameters */
#define DIMMER_INFO                 0x0340
#define MINIMUM_LEVEL               0x0341
#define MAXIMUM_LEVEL               0x0342
#define CURVE                       0x0343
#define CURVE_DESCRIPTION           0x0344
#define OUTPUT_RESPONSE_TIME        0x0345
#define OUTPUT_RESPONSE_TIME_DESCRIPTION 0x0346
#define MODULATION_FREQUENCY        0x0347
#define MODULATION_FREQUENCY_DESCRIPTION 0x0348

/* Table A-5: Product categories */
#define PRODUCT_CATEGORY_NOT_DECLARED           0x0000
#define PRODUCT_CATEGORY_FIXTURE                0x0100
#define PRODUCT_CATEGORY_DIMMER                 0x0300
#define PRODUCT_CATEGORY_DIMMER_AC_INCANDESCENT 0x0301
#define PRODUCT_CATEGORY_DIMMER_AC_FLUORESCENT  0x0302
#define PRODUCT_CATEGORY_DIMMER_AC_COLDCATHODE  0x0303
#define PRODUCT_CATEGORY_DIMMER_AC_NONDIM       0x0304
#define PRODUCT_CATEGORY_DIMMER_AC_ELV          0x0305
#define PRODUCT_CATEGORY_DIMMER_AC_OTHER        0x0306
#define PRODUCT_CATEGORY_DIMMER_DC_LEVEL        0x0307
#define PRODUCT_CATEGORY_DIMMER_DC_PWM          0x0308
#define PRODUCT_CATEGORY_DIMMER_CS_LED          0x0309
#define PRODUCT_CATEGORY_DIMMER_OTHER           0x03FF

/* Table A-12: Sensor types */
#define SENS_TEMPERATURE            0x00
#define SENS_VOLTAGE                0x01
#define SENS_CURRENT                0x02
#define SENS_FREQUENCY              0x03
#define SENS_RESISTANCE             0x04
#define SENS_POWER                  0x05
#define SENS_OTHER                  0x7F

/* Table A-13: Units */
#define UNITS_NONE                  0x00
#define UNITS_CENTIGRADE            0x01
#define UNITS_VOLTS_DC              0x02
#define UNITS_VOLTS_AC_PEAK         0x03
#define UNITS_VOLTS_AC_RMS          0x04
#define UNITS_AMPERE_DC             0x05
#define UNITS_AMPERE_AC_PEAK        0x06
#define UNITS_AMPERE_AC_RMS         0x07
#define UNITS_HERTZ                 0x08
#define UNITS_OHM                   0x09
#define UNITS_WATT                  0x0A
#define UNITS_SECOND                0x15

/* Table A-14: Prefixes */
#define PREFIX_NONE                 0x00
#define PREFIX_DECI                 0x01
#define PREFIX_CENTI                0x02
#define PREFIX_MILLI                0x03

/* SENSOR_DEFINITION "recorded value support" bits */
#define SENSOR_RECORDED_VALUE       0x01
#define SENSOR_LOWEST_HIGHEST       0x02

/* Table A-17: NACK reason codes */
#define NR_UNKNOWN_PID              0x0000
#define NR_FORMAT_ERROR             0x0001
#define NR_HARDWARE_FAULT           0x0002
#define NR_PROXY_REJECT             0x0003
#define NR_WRITE_PROTECT            0x0004
#define NR_UNSUPPORTED_COMMAND_CLASS 0x0005
#define NR_DATA_OUT_OF_RANGE        0x0006
#define NR_BUFFER_FULL              0x0007
#define NR_PACKET_SIZE_UNSUPPORTED  0x0008
#define NR_SUB_DEVICE_OUT_OF_RANGE  0x0009
#define NR_PROXY_BUFFER_FULL        0x000A

/* RESET_DEVICE argument */
#define RESET_WARM                  0x01
#define RESET_COLD                  0xFF

/* Message layout (offsets from start code) */
#define RDM_OFF_START_CODE          0
#define RDM_OFF_SUB_START_CODE      1
#define RDM_OFF_MESSAGE_LENGTH      2
#define RDM_OFF_DEST_UID            3
#define RDM_OFF_SRC_UID             9
#define RDM_OFF_TN                  15
#define RDM_OFF_PORT_OR_RESP_TYPE   16
#define RDM_OFF_MESSAGE_COUNT       17
#define RDM_OFF_SUB_DEVICE          18
#define RDM_OFF_CC                  20
#define RDM_OFF_PID                 21
#define RDM_OFF_PDL                 23
#define RDM_OFF_PD                  24

#define RDM_HEADER_LEN              24      /* til og med PDL */
#define RDM_MAX_PDL                 231
#define RDM_MAX_MESSAGE_LENGTH      (RDM_HEADER_LEN + RDM_MAX_PDL)          /* 255, uden checksum */
#define RDM_MAX_PACKET              (RDM_MAX_MESSAGE_LENGTH + 2)            /* 257, med checksum */
#define RDM_DUB_RESPONSE_LEN        24

#endif /* E120_H_ */
