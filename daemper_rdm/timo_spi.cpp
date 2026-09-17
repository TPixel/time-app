/*
 * timo_spi.cpp — se timo_spi.h.
 *
 * Handshake-mønsteret er det samme som i LumenRadios eksempel:
 *   1. CS lav, send kommandobyte, CS høj  → modulet svarer med IRQ-puls
 *   2. vent på IRQ (falling edge)
 *   3. CS lav, send 0xFF (får IRQ-flags), overfør payload, CS høj
 *   4. vent på at IRQ-pin går høj igen (kommandoen er behandlet)
 */
#include "timo_spi.h"
#include <string.h>

TimoSpi::TimoSpi(int csn_pin, int irq_pin, SPIClass &spi)
    : spi_(spi), csn_pin_(csn_pin), irq_pin_(irq_pin), irq_pending_(false), spi_hz_(2000000) {}

void TimoSpi::begin(uint32_t spi_hz)
{
    spi_hz_ = spi_hz;
    pinMode(irq_pin_, INPUT);
    pinMode(csn_pin_, OUTPUT);
    digitalWrite(csn_pin_, HIGH);
    spi_.begin();
}

void TimoSpi::onIrqFalling() { irq_pending_ = true; }

bool TimoSpi::irqAsserted() const { return digitalRead(irq_pin_) == LOW; }

bool TimoSpi::takeIrqPending()
{
    noInterrupts();
    bool p = irq_pending_;
    irq_pending_ = false;
    interrupts();
    return p;
}

bool TimoSpi::waitIrqPending(uint32_t timeout_ms)
{
    uint32_t t0 = millis();
    while (!takeIrqPending()) {
        if (millis() - t0 > timeout_ms) return false;
    }
    return true;
}

int16_t TimoSpi::transfer(uint8_t command, uint8_t *dst, const uint8_t *src, uint32_t len)
{
    uint8_t irq_flags;
    uint32_t t0 = millis();

    spi_.beginTransaction(SPISettings(spi_hz_, MSBFIRST, SPI_MODE0));

    /* Kommandobyte */
    digitalWrite(csn_pin_, LOW);
    irq_flags = spi_.transfer(command);
    takeIrqPending();
    digitalWrite(csn_pin_, HIGH);

    /* NOP: ingen payload, vent blot på IRQ eller timeout */
    if (len == 0) {
        t0 = millis();
        while (irqAsserted() && !takeIrqPending()) {
            if (millis() - t0 > 10) break;
        }
        spi_.endTransaction();
        return irq_flags;
    }

    if (!waitIrqPending(1000)) {
        spi_.endTransaction();
        return -1;
    }

    /* Payload */
    digitalWrite(csn_pin_, LOW);
    irq_flags = spi_.transfer(0xFF);
    if (irq_flags & TIMO_IRQ_SPI_DEVICE_BUSY) {
        digitalWrite(csn_pin_, HIGH);
        spi_.endTransaction();
        return irq_flags;
    }
    for (uint32_t i = 0; i < len - 1; i++) {
        uint8_t out = src ? src[i] : 0xFF;
        uint8_t in = spi_.transfer(out);
        if (dst) dst[i] = in;
    }
    digitalWrite(csn_pin_, HIGH);

    /* Vent på at modulet er færdigt */
    while (irqAsserted()) {
        if (millis() - t0 > 50) break;
    }
    spi_.endTransaction();
    return irq_flags;
}

int16_t TimoSpi::readReg(uint8_t reg, uint8_t *dst, uint8_t n)
{
    return transfer(TIMO_READ_REG_COMMAND(reg), dst, NULL, (uint32_t)n + 1);
}

int16_t TimoSpi::writeReg(uint8_t reg, const uint8_t *src, uint8_t n)
{
    return transfer(TIMO_WRITE_REG_COMMAND(reg), NULL, src, (uint32_t)n + 1);
}

int16_t TimoSpi::readIrqFlags()
{
    int16_t flags = transfer(TIMO_NOP_COMMAND, NULL, NULL, 0);
    /* Vent på IRQ-puls der fortæller at NOP'en er behandlet */
    waitIrqPending(10);
    return flags;
}

bool TimoSpi::setDmxWindow(uint16_t footprint, uint16_t start_address_1based)
{
    uint16_t start0 = start_address_1based ? (uint16_t)(start_address_1based - 1) : 0;
    scratch_[0] = (uint8_t)(footprint >> 8);
    scratch_[1] = (uint8_t)footprint;
    scratch_[2] = (uint8_t)(start0 >> 8);
    scratch_[3] = (uint8_t)start0;
    return writeReg(TIMO_DMX_WINDOW_REG, scratch_, 4) >= 0;
}

bool TimoSpi::setupAsRdmResponder(const uint8_t uid[6], uint16_t footprint, uint16_t start_address_1based)
{
    uint8_t cfg = 0;

    /* Vent til modulet har bootet (IRQ høj) */
    uint32_t t0 = millis();
    while (irqAsserted() && millis() - t0 < 3000) { takeIrqPending(); }

    if (readReg(TIMO_CONFIG_REG, &cfg, 1) < 0) return false;

    /* Skal være modtager */
    int tries = 0;
    while ((cfg & TIMO_CONFIG_RADIO_TX_RX_MODE) && tries++ < 3) {
        uint8_t v = cfg & (uint8_t)~TIMO_CONFIG_RADIO_TX_RX_MODE;
        writeReg(TIMO_CONFIG_REG, &v, 1);
        delay(3000);                              /* modulet genstarter radioen */
        if (readReg(TIMO_CONFIG_REG, &cfg, 1) < 0) return false;
    }
    if (cfg & TIMO_CONFIG_RADIO_TX_RX_MODE) return false;

    /* Radio til, SPI-RDM til, UART-DMX-udgang bevaret (0x89 som i LumenRadios eksempel) */
    cfg = TIMO_CONFIG_RADIO_EN | TIMO_CONFIG_SPI_RDM_EN | TIMO_CONFIG_UART_EN;
    if (writeReg(TIMO_CONFIG_REG, &cfg, 1) < 0) return false;

    /* Modulet skal kende vores RDM-UID for at kunne route forespørgsler til os */
    if (writeReg(TIMO_BINDING_UID_REG, uid, 6) < 0) return false;

    if (!setDmxWindow(footprint, start_address_1based)) return false;

    /* IRQ ved link-ændring, DMX-ændring og udvidede IRQs (RDM) */
    uint8_t mask = TIMO_IRQ_RF_LINK_FLAG | TIMO_IRQ_DMX_CHANGED_FLAG | TIMO_IRQ_EXTENDED_FLAG;
    if (writeReg(TIMO_IRQ_MASK_REG, &mask, 1) < 0) return false;

    memset(scratch_, 0, 4);
    scratch_[3] = TIMO_EXTIRQ_SPI_RDM_FLAG;
    if (writeReg(TIMO_EXT_IRQ_MASK_REG, scratch_, 4) < 0) return false;

    return true;
}

int16_t TimoSpi::readDmx(uint8_t *dst, uint16_t footprint)
{
    return transfer(TIMO_READ_DMX_COMMAND, dst, NULL, (uint32_t)footprint + 1);
}

uint32_t TimoSpi::readExtIrqFlags()
{
    memset(scratch_, 0, 4);
    if (transfer(TIMO_READ_REG_COMMAND(TIMO_EXT_IRQ_FLAGS_REG), scratch_, NULL, 5) < 0) return 0;
    return ((uint32_t)scratch_[0] << 24) | ((uint32_t)scratch_[1] << 16) | ((uint32_t)scratch_[2] << 8) | scratch_[3];
}

/* Som transfer(), men stopper efter messageLength+2 bytes så vi ikke læser mere end pakken. */
size_t TimoSpi::readRdmRequest(uint8_t *dst, size_t max_len)
{
    uint32_t t0 = millis();
    uint8_t irq_flags;

    spi_.beginTransaction(SPISettings(spi_hz_, MSBFIRST, SPI_MODE0));
    digitalWrite(csn_pin_, LOW);
    spi_.transfer(TIMO_READ_RDM_COMMAND);
    takeIrqPending();
    digitalWrite(csn_pin_, HIGH);

    if (!waitIrqPending(1000)) { spi_.endTransaction(); return 0; }

    digitalWrite(csn_pin_, LOW);
    irq_flags = spi_.transfer(0xFF);
    if (irq_flags & TIMO_IRQ_SPI_DEVICE_BUSY) {
        digitalWrite(csn_pin_, HIGH);
        spi_.endTransaction();
        return 0;
    }
    size_t n = 0;
    size_t want = max_len;
    while (n < want) {
        uint8_t b = spi_.transfer(0xFF);
        dst[n++] = b;
        if (n == 3) {
            /* byte 2 = messageLength (uden checksum) */
            size_t total = (size_t)b + 2;
            if (total < want) want = total;
        }
    }
    digitalWrite(csn_pin_, HIGH);
    while (irqAsserted()) { if (millis() - t0 > 50) break; }
    spi_.endTransaction();
    return n;
}

bool TimoSpi::writeRdmResponse(const uint8_t *src, size_t len)
{
    if (len == 0) return false;
    delay(1);
    return transfer(TIMO_WRITE_RDM_COMMAND, NULL, src, (uint32_t)len + 1) >= 0;
}
