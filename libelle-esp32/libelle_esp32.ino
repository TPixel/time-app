/*
 *  LIBELLE — selvkørende digitalt vaterpas med grøn LED
 *  ====================================================
 *  Hardware:  Seeed XIAO ESP32-C3  +  MPU-6050 (GY-521)  +  grøn & rød LED
 *             + trykknap + (valgfri) piezo-bipper + 3,7 V LiPo på XIAO's BAT-pads
 *
 *  Virkemåde:
 *    - Grøn LED lyser konstant, når hældningen er inden for tolerancen.
 *    - Rød LED blinker, når den er skæv. Jo tættere på vater, jo langsommere blink.
 *    - Kort tryk på knappen:  skift tolerance 0,2° → 0,5° → 1° → 2° (rød blinker 1-4 gange)
 *    - Langt tryk (2 s):      kalibrér = "denne stilling er 0°"  (1-punkts)
 *      Langt tryk igen inden 30 s efter at have drejet enheden 180° på SAMME flade:
 *      2-punkts-kalibrering, som fjerner både sensorens og underlagets skævhed.
 *    - Meget langt tryk (6 s): slet kalibrering.
 *    - Ingen bevægelse i 3 min → dyb søvn. Vågner når enheden flyttes (MPU-6050
 *      motion-interrupt) eller knappen trykkes.
 *
 *  Pins (XIAO ESP32-C3 — GPIO-numre, ikke D-numre):
 *    D4 = GPIO6  SDA        D5 = GPIO7  SCL
 *    D0 = GPIO2  MPU INT    D1 = GPIO3  knap → GND
 *    D2 = GPIO4  grøn LED   D3 = GPIO5  rød LED
 *    D6 = GPIO21 piezo (valgfri, sæt PIN_BUZZER til -1 hvis ingen)
 *
 *  Arduino IDE: Board "XIAO_ESP32C3" (esp32 by Espressif, v3.x). Ingen eksterne
 *  biblioteker — MPU-6050 tales til direkte over I2C.
 */

#include <Wire.h>
#include <Preferences.h>
#include <math.h>
#include "esp_sleep.h"
#include "driver/gpio.h"

// ───────── Konfiguration ─────────
#define PIN_SDA        6
#define PIN_SCL        7
#define PIN_MPU_INT    2
#define PIN_BTN        3
#define PIN_LED_GREEN  4
#define PIN_LED_RED    5
#define PIN_BUZZER     21      // -1 = ingen bipper

static const uint8_t  MPU_ADDR        = 0x68;    // AD0 til GND (0x69 hvis AD0 høj)
static const float    TOL_STEPS[]     = {0.2f, 0.5f, 1.0f, 2.0f};
static const uint8_t  TOL_DEFAULT     = 1;        // index → 0,5°
static const float    HYST_DEG        = 0.05f;    // hysterese så LED'en ikke flimrer på grænsen
static const float    FILTER_ALPHA    = 0.12f;    // lavpas (0..1). Lavere = roligere, langsommere
static const uint32_t SAMPLE_MS       = 20;       // 50 Hz
static const uint32_t IDLE_SLEEP_MS   = 3UL * 60UL * 1000UL;
static const float    MOTION_G        = 0.02f;    // ændring i g der tæller som "bevægelse"
static const uint32_t CAL_WINDOW_MS   = 30000;    // tid til at tage 2. kalibreringspunkt
static const bool     BEEP_ON_LEVEL   = true;

// ───────── Tilstand ─────────
Preferences prefs;
float fx = 0, fy = 0, fz = 1;        // filtreret tyngdevektor (i g)
float refx = 0, refy = 0, refz = 1;  // kalibreret "ned"-vektor (normaliseret)
float cal1x = 0, cal1y = 0, cal1z = 0; uint32_t cal1At = 0; bool haveCal1 = false;
uint8_t tolIdx = TOL_DEFAULT;
bool  isLevel = false;
uint32_t lastMotionAt = 0, lastSampleAt = 0, btnDownAt = 0, ledPhaseAt = 0;
bool  btnWasDown = false, btnHandledLong = false, btnHandledVeryLong = false;
float lastMx = 0, lastMy = 0, lastMz = 1;

// ───────── I2C-hjælpere ─────────
void w8(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(reg); Wire.write(val); Wire.endTransmission();
}
uint8_t r8(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(reg); Wire.endTransmission(false);
  Wire.requestFrom((int)MPU_ADDR, 1); return Wire.available() ? Wire.read() : 0;
}
bool readAccel(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B);            // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 6) != 6) return false;
  int16_t rx = (Wire.read() << 8) | Wire.read();
  int16_t ry = (Wire.read() << 8) | Wire.read();
  int16_t rz = (Wire.read() << 8) | Wire.read();
  ax = rx / 16384.0f; ay = ry / 16384.0f; az = rz / 16384.0f;     // ±2 g
  return true;
}

// MPU-6050 i normal, rolig måletilstand
bool mpuInitMeasure() {
  w8(0x6B, 0x80); delay(100);              // reset
  w8(0x6B, 0x01);                          // vågn, clock = gyro X PLL (mere stabil end intern osc)
  delay(10);
  w8(0x6C, 0x07);                          // gyro i standby — vi bruger kun accelerometer
  w8(0x1A, 0x06);                          // DLPF 5 Hz (hardware-lavpas)
  w8(0x1C, 0x00);                          // ±2 g, ingen HPF
  w8(0x19, 0x09);                          // sample rate 1 kHz / (1+9) = 100 Hz
  w8(0x38, 0x00);                          // ingen interrupts
  return r8(0x75) == 0x68;                 // WHO_AM_I
}

// MPU-6050 i lavstrøms "cycle"-tilstand med motion-interrupt på INT (aktiv lav, latched)
void mpuInitMotionWake() {
  w8(0x6B, 0x00); delay(10);
  w8(0x1A, 0x00);
  w8(0x1C, 0x01);                          // ±2 g, HPF 5 Hz (kræves af motion-detektion)
  w8(0x1F, 10);                            // MOT_THR  — følsomhed (1 LSB ≈ 2 mg). Lavere = mere følsom
  w8(0x20, 20);                            // MOT_DUR  — ms over tærsklen
  w8(0x69, 0x15);                          // MOT_DETECT_CTRL: accel-on-delay
  w8(0x37, 0xB0);                          // INT_PIN_CFG: aktiv LAV, push-pull, latched, ryd ved læsning
  w8(0x38, 0x40);                          // INT_ENABLE: MOT_EN
  r8(0x3A);                                // ryd evt. hængende interrupt
  w8(0x6C, 0x47);                          // PWR_MGMT_2: wake 5 Hz, gyro standby
  w8(0x6B, 0x28);                          // PWR_MGMT_1: CYCLE=1, TEMP_DIS=1
}

// ───────── Små hjælpere ─────────
void normalize(float &x, float &y, float &z) {
  float n = sqrtf(x*x + y*y + z*z); if (n < 1e-6f) { x = 0; y = 0; z = 1; return; }
  x /= n; y /= n; z /= n;
}
void beep(uint16_t freq, uint16_t ms) {
#if PIN_BUZZER >= 0
  uint32_t half = 500000UL / freq; uint32_t cycles = (uint32_t)ms * 1000UL / (2 * half);
  for (uint32_t i = 0; i < cycles; i++) {
    digitalWrite(PIN_BUZZER, HIGH); delayMicroseconds(half);
    digitalWrite(PIN_BUZZER, LOW);  delayMicroseconds(half);
  }
#endif
}
void blinkRed(uint8_t n, uint16_t ms) {
  for (uint8_t i = 0; i < n; i++) { digitalWrite(PIN_LED_RED, HIGH); delay(ms); digitalWrite(PIN_LED_RED, LOW); delay(ms); }
}
void blinkBoth(uint8_t n, uint16_t ms) {
  for (uint8_t i = 0; i < n; i++) {
    digitalWrite(PIN_LED_RED, HIGH); digitalWrite(PIN_LED_GREEN, HIGH); delay(ms);
    digitalWrite(PIN_LED_RED, LOW);  digitalWrite(PIN_LED_GREEN, LOW);  delay(ms);
  }
}

void loadPrefs() {
  prefs.begin("libelle", true);
  refx = prefs.getFloat("rx", 0); refy = prefs.getFloat("ry", 0); refz = prefs.getFloat("rz", 1);
  tolIdx = prefs.getUChar("tol", TOL_DEFAULT);
  prefs.end();
  if (tolIdx >= sizeof(TOL_STEPS)/sizeof(TOL_STEPS[0])) tolIdx = TOL_DEFAULT;
  normalize(refx, refy, refz);
}
void saveRef() {
  prefs.begin("libelle", false);
  prefs.putFloat("rx", refx); prefs.putFloat("ry", refy); prefs.putFloat("rz", refz);
  prefs.end();
}
void saveTol() { prefs.begin("libelle", false); prefs.putUChar("tol", tolIdx); prefs.end(); }

// Vinkel (grader) mellem filtreret tyngdevektor og referencen
float tiltDeg() {
  float x = fx, y = fy, z = fz; normalize(x, y, z);
  float d = x*refx + y*refy + z*refz; if (d > 1) d = 1; if (d < -1) d = -1;
  return acosf(d) * 180.0f / (float)M_PI;
}

// ───────── Kalibrering ─────────
void calibratePress() {
  float x = fx, y = fy, z = fz; normalize(x, y, z);
  uint32_t now = millis();
  if (haveCal1 && (now - cal1At) < CAL_WINDOW_MS) {
    // 2-punkts: gennemsnit af de to målinger fjerner underlagets hældning
    refx = cal1x + x; refy = cal1y + y; refz = cal1z + z; normalize(refx, refy, refz);
    haveCal1 = false; saveRef();
    Serial.println("Kalibrering: 2-punkts gemt");
    blinkBoth(4, 100); beep(1500, 80); delay(60); beep(2000, 120);
  } else {
    refx = x; refy = y; refz = z; saveRef();
    cal1x = x; cal1y = y; cal1z = z; cal1At = now; haveCal1 = true;
    Serial.println("Kalibrering: 1-punkts gemt (drej 180° og hold igen for 2-punkts)");
    blinkBoth(2, 100); beep(1500, 100);
  }
}
void calibrateReset() {
  refx = 0; refy = 0; refz = 1; haveCal1 = false; saveRef();
  Serial.println("Kalibrering slettet");
  blinkRed(6, 60); beep(400, 300);
}

// ───────── Søvn ─────────
void goToSleep() {
  Serial.println("Ingen bevægelse — sover. Flyt enheden eller tryk knappen for at vågne.");
  Serial.flush();
  digitalWrite(PIN_LED_GREEN, LOW); digitalWrite(PIN_LED_RED, LOW);
  mpuInitMotionWake();
  pinMode(PIN_MPU_INT, INPUT_PULLUP); pinMode(PIN_BTN, INPUT_PULLUP);
  gpio_pullup_en((gpio_num_t)PIN_BTN); gpio_pullup_en((gpio_num_t)PIN_MPU_INT);
  // ESP32-C3: GPIO 0-5 kan vække fra dyb søvn. Begge linjer er aktiv-lave.
  esp_deep_sleep_enable_gpio_wakeup((1ULL << PIN_MPU_INT) | (1ULL << PIN_BTN), ESP_GPIO_WAKEUP_GPIO_LOW);
  esp_deep_sleep_start();
}

// ───────── Setup ─────────
void setup() {
  pinMode(PIN_LED_GREEN, OUTPUT); pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BTN, INPUT_PULLUP);  pinMode(PIN_MPU_INT, INPUT_PULLUP);
#if PIN_BUZZER >= 0
  pinMode(PIN_BUZZER, OUTPUT); digitalWrite(PIN_BUZZER, LOW);
#endif
  Serial.begin(115200);
  delay(50);
  Serial.println("\nLIBELLE starter");

  Wire.begin(PIN_SDA, PIN_SCL); Wire.setClock(400000);
  if (!mpuInitMeasure()) {
    Serial.println("FEJL: MPU-6050 ikke fundet (tjek SDA/SCL/adresse). Rød LED blinker hurtigt.");
    while (true) { blinkRed(1, 80); }
  }
  loadPrefs();
  Serial.printf("Tolerance %.1f°  ref=(%.3f %.3f %.3f)\n", TOL_STEPS[tolIdx], refx, refy, refz);

  float ax, ay, az;
  if (readAccel(ax, ay, az)) { fx = ax; fy = ay; fz = az; lastMx = ax; lastMy = ay; lastMz = az; }
  lastMotionAt = millis();
  blinkBoth(1, 150);
}

// ───────── Loop ─────────
void loop() {
  uint32_t now = millis();

  // ── Måling ──
  if (now - lastSampleAt >= SAMPLE_MS) {
    lastSampleAt = now;
    float ax, ay, az;
    if (readAccel(ax, ay, az)) {
      fx += (ax - fx) * FILTER_ALPHA; fy += (ay - fy) * FILTER_ALPHA; fz += (az - fz) * FILTER_ALPHA;
      // bevægelsesdetektion til auto-søvn
      if (fabsf(ax - lastMx) > MOTION_G || fabsf(ay - lastMy) > MOTION_G || fabsf(az - lastMz) > MOTION_G) {
        lastMotionAt = now; lastMx = ax; lastMy = ay; lastMz = az;
      }
    }
  }

  // ── Knap ──
  bool down = digitalRead(PIN_BTN) == LOW;
  if (down && !btnWasDown) { btnDownAt = now; btnHandledLong = false; btnHandledVeryLong = false; lastMotionAt = now; }
  if (down && !btnHandledVeryLong && now - btnDownAt >= 6000) { btnHandledVeryLong = true; btnHandledLong = true; calibrateReset(); }
  if (!down && btnWasDown) {
    uint32_t held = now - btnDownAt;
    if (held >= 2000 && !btnHandledVeryLong)      { calibratePress(); }
    else if (held >= 40 && held < 2000)           {
      tolIdx = (tolIdx + 1) % (sizeof(TOL_STEPS)/sizeof(TOL_STEPS[0])); saveTol();
      Serial.printf("Tolerance %.1f°\n", TOL_STEPS[tolIdx]);
      digitalWrite(PIN_LED_GREEN, LOW); blinkRed(tolIdx + 1, 150);
    }
  }
  btnWasDown = down;

  // ── Vurdering med hysterese ──
  float t = tiltDeg(), tol = TOL_STEPS[tolIdx];
  bool nowLevel = isLevel ? (t <= tol + HYST_DEG) : (t <= tol - HYST_DEG * 0.5f);
  if (nowLevel && !isLevel && BEEP_ON_LEVEL) beep(2200, 40);
  isLevel = nowLevel;

  // ── LED'er ──
  if (isLevel) {
    digitalWrite(PIN_LED_GREEN, HIGH); digitalWrite(PIN_LED_RED, LOW);
  } else {
    digitalWrite(PIN_LED_GREEN, LOW);
    // blinkperiode: 900 ms lige uden for tolerancen → 120 ms ved ≥ 10× tolerance
    float r = (t - tol) / (tol * 9.0f); if (r < 0) r = 0; if (r > 1) r = 1;
    uint32_t period = 900 - (uint32_t)(r * 780.0f);
    digitalWrite(PIN_LED_RED, ((now - ledPhaseAt) % period) < period / 2 ? HIGH : LOW);
  }

  // ── Debug hver ½ sek ──
  static uint32_t lastPrint = 0;
  if (now - lastPrint >= 500) {
    lastPrint = now;
    Serial.printf("tilt %.2f°  tol %.1f°  %s   g=(%.3f %.3f %.3f)\n", t, tol, isLevel ? "I VATER" : "skæv", fx, fy, fz);
  }

  // ── Auto-søvn ──
  if (now - lastMotionAt >= IDLE_SLEEP_MS) goToSleep();

  delay(2);
}
