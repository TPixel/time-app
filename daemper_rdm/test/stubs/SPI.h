#ifndef SPI_STUB_H
#define SPI_STUB_H
#include "Arduino.h"
struct SPISettings { SPISettings(uint32_t, int, int); };
struct SPIClass {
    void begin();
    void beginTransaction(SPISettings);
    void endTransaction();
    uint8_t transfer(uint8_t);
};
extern SPIClass SPI;
#endif
