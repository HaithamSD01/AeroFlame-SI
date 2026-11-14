/*
  AeroFlame edge node - ESP32 (Arduino core)
  Reads an IR flame sensor, MQ-2 smoke/gas sensor and BME280 (temp/pressure/humidity),
  sounds a local buzzer, and streams one JSON line per second over USB serial (115200 baud)
  to the AeroFlame SI dashboard (pages/1_Live_Habitat_Monitor.py).

  Libraries: "Adafruit BME280 Library" + "Adafruit Unified Sensor" (Arduino Library Manager).
  Wiring: see hardware/WIRING.md
*/
#include <Wire.h>
#include <Adafruit_BME280.h>

const int FLAME_PIN  = 5;    // IR flame sensor DO (most modules: LOW = flame seen)
const int SMOKE_PIN  = 34;   // MQ-2 AO through a voltage divider (ESP32 ADC max 3.3 V)
const int BUZZER_PIN = 13;   // active buzzer (+) ; (-) to GND
const int SMOKE_LOCAL_ALARM = 1800;   // raw ADC (0-4095), tune after MQ-2 warm-up

Adafruit_BME280 bme;
bool bmeOk = false;

void setup() {
  Serial.begin(115200);
  pinMode(FLAME_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  analogReadResolution(12);
  Wire.begin(21, 22);                       // SDA, SCL
  bmeOk = bme.begin(0x76) || bme.begin(0x77);
}

void printFloat(const char* key, float v, bool comma = true) {
  Serial.print('"'); Serial.print(key); Serial.print("\":");
  if (isnan(v)) Serial.print("null"); else Serial.print(v, 2);
  if (comma) Serial.print(',');
}

void loop() {
  bool flame = digitalRead(FLAME_PIN) == LOW;
  int smoke  = analogRead(SMOKE_PIN);
  float t = bmeOk ? bme.readTemperature() : NAN;
  float p = bmeOk ? bme.readPressure() / 100.0F : NAN;   // hPa
  float h = bmeOk ? bme.readHumidity() : NAN;

  // Local fail-safe alarm: works even if the dashboard is offline
  digitalWrite(BUZZER_PIN, (flame || smoke > SMOKE_LOCAL_ALARM) ? HIGH : LOW);

  Serial.print("{\"node\":\"AF-01\",\"uptime_s\":"); Serial.print(millis() / 1000); Serial.print(',');
  Serial.print("\"flame_detected\":"); Serial.print(flame ? "true" : "false"); Serial.print(',');
  printFloat("temperature_c", t);
  printFloat("pressure_hpa", p);
  printFloat("humidity_pct", h);
  Serial.print("\"smoke_raw\":"); Serial.print(smoke);
  Serial.println('}');
  delay(1000);
}
