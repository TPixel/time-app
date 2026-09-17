/* Minimal Arduino-stub — kun til syntax-tjek med g++, ikke til at køre. */
#ifndef ARDUINO_STUB_H
#define ARDUINO_STUB_H
#include <stdint.h>
#include <stddef.h>
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define FALLING 2
#define MSBFIRST 1
#define SPI_MODE0 0
#define LED_BUILTIN 13
#define A0 14
#define A1 15
#define HEX 16
#define DEC 10
void pinMode(int, int);
void digitalWrite(int, int);
int digitalRead(int);
void analogWrite(int, int);
int analogRead(int);
unsigned long millis();
void delay(unsigned long);
void attachInterrupt(int, void (*)(), int);
int digitalPinToInterrupt(int);
void noInterrupts();
void interrupts();
struct SerialStub {
    void begin(unsigned long);
    void print(const char *); void print(int); void print(unsigned int); void print(long); void print(unsigned long);
    void print(int, int); void print(unsigned int, int); void print(long, int); void print(unsigned long, int);
    void println(const char *); void println(int); void println(unsigned int); void println(long); void println(unsigned long);
    void println(int, int); void println(unsigned int, int); void println(long, int); void println(unsigned long, int);
    void println();
};
extern SerialStub Serial;
#endif
