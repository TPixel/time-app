/*
 * timo_spi.h — SPI-driver til LumenRadio TimoTwo (CRMX) i modtager-tilstand.
 *
 * Register- og kommando-definitioner samt transfer-logikken er baseret på
 * LumenRadios eksempel "crmx-timotwo-spi-rdm-responder" (MIT-licens,
 * Copyright (c) 2021 LumenRadio AB) — se LICENSE-LumenRadio.txt.
 *
 * Kun Arduino-API'et bruges (SPI, digitalWrite, millis), så driveren virker
 * på RP2040 (arduino-pico), ESP32, SAMD og AVR.
 */
#ifndef TIMO_SPI_H_
#define TIMO_SPI_H_

#include <Arduino.h>
#include <SPI.h>
#include <stdint.h>

/* SPI-kommandoer */
#define TIMO_READ_REG_COMMAND(address)  (address)
#define TIMO_WRITE_REG_COMMAND(address) (0x40 | (address))
#define TIMO_READ_DMX_COMMAND           0x81
#define TIMO_READ_ASC_COMMAND           0x82
#define TIMO_READ_RDM_COMMAND           0x83
#define TIMO_WRITE_DMX_COMMAND          0x91
#define TIMO_WRITE_RDM_COMMAND          0x92
#define TIMO_NOP_COMMAND                0xFF

/* Registre */
#define TIMO_CONFIG_REG                 0x00
#define TIMO_STATUS_REG                 0x01
#define TIMO_IRQ_MASK_REG               0x02
#define TIMO_IRQ_FLAGS_REG              0x03
#define TIMO_DMX_WINDOW_REG             0x04
#define TIMO_ASC_FRAME_REG              0x05
#define TIMO_LINK_QUALITY_REG           0x06
#define TIMO_ANTENNA_REG                0x07
#define TIMO_DMX_SPEC_REG               0x08
#define TIMO_DMX_CONTROL_REG            0x09
#define TIMO_EXT_IRQ_MASK_REG           0x0A
#define TIMO_EXT_IRQ_FLAGS_REG          0x0B
#define TIMO_VERSION_REG                0x10
#define TIMO_RF_POWER_REG               0x11
#define TIMO_BLOCKED_CHANNELS_REG       0x12
#define TIMO_BINDING_UID_REG            0x20
#define TIMO_BLE_STATUS_REG             0x30
#define TIMO_BLE_PIN_REG                0x31
#define TIMO_BATTERY_REG                0x32
#define TIMO_UNIVERSE_COLOR_REG         0x33
#define TIMO_OEM_INFO_REG               0x34

/* CONFIG-register bits */
#define TIMO_CONFIG_UART_EN             (1 << 0)
#define TIMO_CONFIG_RADIO_TX_RX_MODE    (1 << 1)   /* 1 = sender, 0 = modtager */
#define TIMO_CONFIG_SPI_RDM_EN          (1 << 3)
#define TIMO_CONFIG_RADIO_EN            (1 << 7)

/* STATUS-register bits */
#define TIMO_STATUS_LINKED              (1 << 0)
#define TIMO_STATUS_DMX_AVAILABLE       (1 << 1)
#define TIMO_STATUS_IDENTIFY            (1 << 2)

/* IRQ-flags (returneres som første byte i hver SPI-transaktion) */
#define TIMO_IRQ_RX_DMX_FLAG            (1 << 0)
#define TIMO_IRQ_LOST_DMX_FLAG          (1 << 1)
#define TIMO_IRQ_DMX_CHANGED_FLAG       (1 << 2)
#define TIMO_IRQ_RF_LINK_FLAG           (1 << 3)
#define TIMO_IRQ_ASC_FLAG               (1 << 4)
#define TIMO_IRQ_IDENTIFY_FLAG          (1 << 5)
#define TIMO_IRQ_EXTENDED_FLAG          (1 << 6)
#define TIMO_IRQ_SPI_DEVICE_BUSY        (1 << 7)

/* Udvidede IRQ-flags (32 bit, laveste byte) */
#define TIMO_EXTIRQ_SPI_RDM_FLAG        (1 << 0)
#define TIMO_EXTIRQ_SPI_RADIO_DISC_FLAG (1 << 3)

class TimoSpi {
public:
    TimoSpi(int csn_pin, int irq_pin, SPIClass &spi = SPI);

    /* Starter SPI og pins. Skal kaldes fra setup(). ISR'en skal kaldes fra
     * en attachInterrupt(FALLING)-handler på irq_pin — se onIrqFalling(). */
    void begin(uint32_t spi_hz = 2000000);
    void onIrqFalling();               /* kald fra ISR */
    bool irqAsserted() const;          /* IRQ-pin er lav = modulet har noget til os */

    /* Rå transaktion: cmd + payload. Returnerer IRQ-flags eller -1 ved timeout.
     * len tæller IRQ-flag-byten med, dvs. len = registerlængde + 1. */
    int16_t transfer(uint8_t command, uint8_t *dst, const uint8_t *src, uint32_t len);

    /* Læser et registret (n bytes) til dst. */
    int16_t readReg(uint8_t reg, uint8_t *dst, uint8_t n);
    int16_t writeReg(uint8_t reg, const uint8_t *src, uint8_t n);

    /* Læser IRQ-flags med en NOP. */
    int16_t readIrqFlags();

    /* Opsætning til RDM-responder: RX-mode, SPI-RDM til, UART-DMX-udgang
     * bevaret, binding-UID sat, IRQ-masker sat. Returnerer false ved fejl. */
    bool setupAsRdmResponder(const uint8_t uid[6], uint16_t footprint, uint16_t start_address_1based);

    /* DMX-vindue = de kanaler modulet leverer via READ_DMX. Start er 1-baseret som på lampen. */
    bool setDmxWindow(uint16_t footprint, uint16_t start_address_1based);

    /* Læser DMX-vinduet (footprint bytes) til dst. */
    int16_t readDmx(uint8_t *dst, uint16_t footprint);

    /* Læser en ventende RDM-forespørgsel. Returnerer antal bytes (inkl. checksum) eller 0. */
    size_t readRdmRequest(uint8_t *dst, size_t max_len);

    /* Sender et RDM-svar (rå pakke fra rdm_responder_handle). */
    bool writeRdmResponse(const uint8_t *src, size_t len);

    uint32_t readExtIrqFlags();

    /* Venter paa naeste IRQ-puls (falling edge). true hvis den kom inden timeout. */
    bool waitForIrq(uint32_t timeout_ms) { return waitIrqPending(timeout_ms); }

private:
    bool takeIrqPending();
    bool waitIrqPending(uint32_t timeout_ms);

    SPIClass &spi_;
    int csn_pin_, irq_pin_;
    volatile bool irq_pending_;
    uint32_t spi_hz_;
    uint8_t scratch_[16];
};

#endif /* TIMO_SPI_H_ */
