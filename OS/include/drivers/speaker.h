#ifndef OXYGEN_DRIVERS_SPEAKER_H
#define OXYGEN_DRIVERS_SPEAKER_H

#include "types.h"

#ifdef __cplusplus
extern "C" {
#endif

void speaker_init(void);
void speaker_play_tone(uint32_t frequency_hz);
void speaker_stop_tone(void);
void speaker_beep(uint32_t frequency_hz, uint32_t duration_ms);
void speaker_play_melody(const uint32_t* frequencies, const uint32_t* durations, size_t note_count);
void speaker_play_startup_chime(void);
void speaker_play_alert(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_SPEAKER_H
