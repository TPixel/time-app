/*
 * config.h — alt der skal tilpasses din dæmper samles her.
 */
#ifndef DAEMPER_CONFIG_H_
#define DAEMPER_CONFIG_H_

#include <stdint.h>
#include "e120.h"

/* ---- TimoTwo SPI ------------------------------------------------------ */
/* SPI-bussens SCK/MOSI/MISO er boardets standard-SPI. CSn og IRQ vælges her. */
#define TIMO_CSN_PIN            5
#define TIMO_IRQ_PIN            3      /* skal kunne lave ekstern interrupt */
#define TIMO_SPI_HZ             2000000

/* ---- Dæmperens udgange ------------------------------------------------ */
#define DIMMER_CHANNELS         4
static const uint8_t PWM_PINS[DIMMER_CHANNELS] = { 9, 10, 11, 12 };
#define IDENTIFY_LED_PIN        LED_BUILTIN

/* ---- Sensorer ----------------------------------------------------------- */
/* Sæt ENABLED til 0 for at slå en sensor fra (den forsvinder så fra RDM).
 * Skaleringen sker i read_temperature() og read_voltage() i daemper_rdm.ino. */
#define TEMP_SENSOR_ENABLED     1
#define TEMP_ADC_PIN            A0     /* fx TMP36 / NTC */
#define VOLT_SENSOR_ENABLED     1
#define VOLT_ADC_PIN            A1     /* spændingsdeler på indgangsspænding */
#define VOLT_DIVIDER_RATIO      11.0f  /* (R1+R2)/R2, fx 100k/10k = 11 */
#define ADC_REF_VOLT            3.3f
#define ADC_MAX                 1023.0f

/* ---- RDM-identitet ------------------------------------------------------ */
/* 0x7FF0–0x7FFF er ESTA's område til prototyper/udvikling. Et rigtigt
 * produkt skal have sit eget manufacturer ID fra https://tsp.esta.org */
#define RDM_MANUFACTURER_ID     0x7FF0
/* Bruges kun hvis MCU'en ikke har et unikt chip-ID (RP2040/ESP32 har). */
#define RDM_DEVICE_ID_FALLBACK  0x00000001

#define RDM_MANUFACTURER_LABEL  "TPixel"
#define RDM_MODEL_DESCRIPTION   "Daemper 4ch"
#define RDM_MODEL_ID            0x0001
#define RDM_PRODUCT_CATEGORY    PRODUCT_CATEGORY_DIMMER_DC_PWM
#define RDM_SOFTWARE_VERSION_ID 0x00010000
#define RDM_SOFTWARE_VERSION    "1.0.0"

/* ---- Debug -------------------------------------------------------------- */
#define DEBUG_SERIAL            1
#define DEBUG_BAUD              115200

#endif /* DAEMPER_CONFIG_H_ */
