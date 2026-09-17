#ifndef EEPROM_STUB_H
#define EEPROM_STUB_H
#include "Arduino.h"
struct EEPROMClass {
    void begin(size_t);
    bool commit();
    template <typename T> T &get(int, T &t) { return t; }
    template <typename T> const T &put(int, const T &t) { return t; }
};
extern EEPROMClass EEPROM;
#endif
