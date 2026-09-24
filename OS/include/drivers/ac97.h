#ifndef OXYGEN_DRIVERS_AC97_H
#define OXYGEN_DRIVERS_AC97_H

#include "types.h"

struct AC97DeviceInfo {
    bool     present;
    uint16_t vendor_id;
    uint16_t device_id;
    uint16_t nam_base;   // Native Audio Mixer (BAR0)
    uint16_t nabm_base;  // Native Audio Bus Master (BAR1)
    uint8_t  irq;
    uint8_t  master_volume; // 0 - 100
};

#ifdef __cplusplus
extern "C" {
#endif

bool              ac97_init(void);
bool              ac97_is_available(void);
const AC97DeviceInfo* ac97_get_info(void);
void              ac97_set_volume(uint8_t volume_percent);
uint8_t           ac97_get_volume(void);
bool              ac97_play_tone(uint32_t frequency_hz, uint32_t duration_ms);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_AC97_H
