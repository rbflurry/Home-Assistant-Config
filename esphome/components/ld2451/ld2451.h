#pragma once

#include "esphome/core/component.h"
#include "esphome/components/uart/uart.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/components/binary_sensor/binary_sensor.h"

namespace esphome {
namespace ld2451 {

// Frame format:
//   Header:  F4 F3 F2 F1
//   Length:  2 bytes little-endian (payload only, not including footer)
//   Payload:
//     byte 0:   target count (0–5)
//     byte 1:   alarm (01 = approaching)
//     per target (5 bytes each):
//       [0] angle byte  (angle_deg = value - 0x80)
//       [1] distance    (meters)
//       [2] direction   (01 = approach, 00 = away)
//       [3] speed       (km/h)
//       [4] SNR         (0–255)
//   Footer:  F8 F7 F6 F5

class LD2451Component : public Component, public uart::UARTDevice {
 public:
  void set_speed_sensor(sensor::Sensor *s)        { speed_sensor_ = s; }
  void set_distance_sensor(sensor::Sensor *s)     { distance_sensor_ = s; }
  void set_angle_sensor(sensor::Sensor *s)        { angle_sensor_ = s; }
  void set_snr_sensor(sensor::Sensor *s)          { snr_sensor_ = s; }
  void set_target_count_sensor(sensor::Sensor *s) { target_count_sensor_ = s; }
  void set_approaching_sensor(binary_sensor::BinarySensor *s) { approaching_sensor_ = s; }
  void set_speed_approaching_sensor(sensor::Sensor *s) { speed_approaching_sensor_ = s; }
  void set_speed_leaving_sensor(sensor::Sensor *s)     { speed_leaving_sensor_ = s; }  
  void set_min_angle(int min_angle)       { min_angle_ = min_angle; }
  void set_max_angle(int max_angle)       { max_angle_ = max_angle; }
  void set_min_distance(int min_distance) { min_distance_ = min_distance; }
  void set_max_distance(int max_distance) { max_distance_ = max_distance; }
  void set_min_snr(int min_snr)           { min_snr_ = min_snr; }
  void set_min_speed(int min_speed)       { min_speed_ = min_speed; }

  void setup() override {}

  void loop() override {
    while (available()) {
      uint8_t b = read();
      switch (sync_pos_) {
        case 0: sync_pos_ = (b == 0xF4) ? 1 : 0; break;
        case 1: sync_pos_ = (b == 0xF3) ? 2 : 0; break;
        case 2: sync_pos_ = (b == 0xF2) ? 3 : 0; break;
        case 3:
          if (b == 0xF1) { sync_pos_ = 0; process_frame_(); }
          else sync_pos_ = 0;
          break;
      }
    }
  }

 protected:
  sensor::Sensor *speed_sensor_{nullptr};
  sensor::Sensor *distance_sensor_{nullptr};
  sensor::Sensor *angle_sensor_{nullptr};
  sensor::Sensor *snr_sensor_{nullptr};
  sensor::Sensor *target_count_sensor_{nullptr};
  binary_sensor::BinarySensor *approaching_sensor_{nullptr};
  sensor::Sensor *speed_approaching_sensor_{nullptr};
  sensor::Sensor *speed_leaving_sensor_{nullptr};
  int min_angle_{-30};
  int max_angle_{30};
  int min_distance_{0};
  int max_distance_{100};
  int min_snr_{0};
  int min_speed_{0};

  uint8_t sync_pos_{0};

  void process_frame_() {
    // Need at least length (2) + minimum payload (2) + footer (4)
    if (available() < 8) return;

    uint8_t len_lo = read(), len_hi = read();
    uint16_t data_len = (uint16_t)len_lo | ((uint16_t)len_hi << 8);

    // Sanity check: max 5 targets * 5 bytes + 2 header bytes = 27
    if (data_len < 2 || data_len > 32) {
      ESP_LOGW("ld2451", "Implausible frame length %d, discarding", data_len);
      return;
    }

    if (available() < (int)(data_len + 4)) return;

    uint8_t buf[32];
    for (uint16_t i = 0; i < data_len; i++) buf[i] = read();

    // Validate footer
    uint8_t f[4];
    for (int i = 0; i < 4; i++) f[i] = read();
    if (f[0] != 0xF8 || f[1] != 0xF7 || f[2] != 0xF6 || f[3] != 0xF5) {
      ESP_LOGW("ld2451", "Footer mismatch, discarding frame");
      return;
    }

    uint8_t target_count = buf[0];

    if (target_count_sensor_ != nullptr)
      target_count_sensor_->publish_state(target_count);

    if (target_count == 0) {
      if (approaching_sensor_ != nullptr) approaching_sensor_->publish_state(false);
      return;
    }

    // Find the fastest target across all reported targets
    uint8_t best_speed = 0, best_dist = 0, best_snr = 0;
    int8_t  best_angle = 0;
    uint8_t best_dir = 0;

    for (uint8_t i = 0; i < target_count && (2 + i * 5 + 4) <= data_len; i++) {
      uint8_t *t   = &buf[2 + i * 5];
      int8_t  angle = (int8_t)t[0] - 0x80;
      uint8_t dist  = t[1];
      uint8_t dir   = t[2];
      uint8_t spd   = t[3];
      uint8_t snr   = t[4];
	  
    ESP_LOGD("ld2451", "  Target %d: %.1f mph @ %.0f ft  angle:%d°  dir:%s  SNR:%d",
           i, spd * 0.621371f, dist * 3.28084f, angle,
           dir == 0x01 ? "approach" : "away", snr);

	if (angle < min_angle_ || angle > max_angle_) {
		ESP_LOGD("ld2451", "  Skipping target %d: angle %d° out of range", i, angle);
		continue;
	  }
	  if (dist < min_distance_ || dist > max_distance_) {
		ESP_LOGD("ld2451", "  Skipping target %d: distance %d m out of range", i, dist);
		continue;
	  }
	  if (snr < min_snr_) {
		ESP_LOGD("ld2451", "  Skipping target %d: SNR %d below minimum", i, snr);
		continue;
	  }
	  if (spd < min_speed_) {
		ESP_LOGD("ld2451", "  Skipping target %d: speed %d below minimum", i, spd);
		continue;
	  }

      if (spd > best_speed) {
        best_speed = spd;
        best_dist  = dist;
        best_angle = angle;
        best_dir   = dir;
        best_snr   = snr;
      }
    }

	if (best_speed == 0) return;

	if (speed_sensor_ != nullptr)
		speed_sensor_->publish_state(best_speed * 0.621371f);

	if (best_dir == 0x01) {	
		if (speed_approaching_sensor_ != nullptr)
			  speed_approaching_sensor_->publish_state(best_speed * 0.621371f);
		} else {
			if (speed_leaving_sensor_ != nullptr)
			  speed_leaving_sensor_->publish_state(best_speed * 0.621371f);
		}
    if (distance_sensor_ != nullptr) distance_sensor_->publish_state(best_dist * 3.28084f);
    if (angle_sensor_ != nullptr)    angle_sensor_->publish_state(best_angle);
    if (snr_sensor_ != nullptr)      snr_sensor_->publish_state(best_snr);
    if (approaching_sensor_ != nullptr)
      approaching_sensor_->publish_state(best_dir == 0x01);

    ESP_LOGD("ld2451", "Targets:%d  Best: %.1f mph @ %.0f ft  angle:%d°  dir:%s  SNR:%d",
         target_count, best_speed * 0.621371f, best_dist * 3.28084f, best_angle,
         best_dir == 0x01 ? "approach" : "away", best_snr);
  }
};

}  // namespace ld2451
}  // namespace esphome