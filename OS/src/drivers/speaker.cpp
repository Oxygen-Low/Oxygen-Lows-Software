#include "drivers/speaker.h"
#include "arch/x86_64/io.h"
#include "arch/x86_64/pit.h"
#include "drivers/serial.h"

#define SPEAKER_PORT 0x61

extern "C" {

void speaker_init(void) {
    speaker_stop_tone();
    serial_printf("[AUDIO] PC Speaker driver initialized\n");
}

void speaker_play_tone(uint32_t frequency_hz) {
    if (frequency_hz == 0 || frequency_hz < 20 || frequency_hz > 20000) {
        speaker_stop_tone();
        return;
    }

    uint32_t divisor = PIT_BASE_FREQUENCY / frequency_hz;
    if (divisor == 0) divisor = 1;
    if (divisor > 65535) divisor = 65535;

    // Configure PIT Channel 2 (Square wave, binary, 16-bit)
    outb(PIT_COMMAND_PORT, 0xB6);
    io_wait();

    // Divisor low and high byte to port 0x42
    outb(PIT_CHANNEL2_DATA_PORT, static_cast<uint8_t>(divisor & 0xFF));
    io_wait();
    outb(PIT_CHANNEL2_DATA_PORT, static_cast<uint8_t>((divisor >> 8) & 0xFF));
    io_wait();

    // Enable speaker bits (bit 0 = timer 2 gate, bit 1 = speaker data)
    uint8_t state = inb(SPEAKER_PORT);
    if ((state & 0x03) != 0x03) {
        outb(SPEAKER_PORT, state | 0x03);
    }
}

void speaker_stop_tone(void) {
    uint8_t state = inb(SPEAKER_PORT);
    outb(SPEAKER_PORT, state & 0xFC);
}

void speaker_beep(uint32_t frequency_hz, uint32_t duration_ms) {
    speaker_play_tone(frequency_hz);
    pit_sleep_ms(duration_ms);
    speaker_stop_tone();
}

void speaker_play_melody(const uint32_t* frequencies, const uint32_t* durations, size_t note_count) {
    if (!frequencies || !durations) return;
    for (size_t i = 0; i < note_count; ++i) {
        if (frequencies[i] > 0) {
            speaker_play_tone(frequencies[i]);
            pit_sleep_ms(durations[i]);
            speaker_stop_tone();
        } else {
            pit_sleep_ms(durations[i]);
        }
        pit_sleep_ms(15); // Short articulation pause
    }
}

void speaker_play_startup_chime(void) {
    // Oxygen Low's Software Chime: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
    const uint32_t notes[4] = { 523, 659, 784, 1046 };
    const uint32_t durations[4] = { 90, 90, 110, 220 };
    speaker_play_melody(notes, durations, 4);
}

void speaker_play_alert(void) {
    const uint32_t notes[2] = { 880, 440 };
    const uint32_t durations[2] = { 80, 120 };
    speaker_play_melody(notes, durations, 2);
}

} // extern "C"
