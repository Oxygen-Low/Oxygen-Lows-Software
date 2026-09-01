#ifndef OXYGEN_ARCH_PIT_H
#define OXYGEN_ARCH_PIT_H

#include "types.h"

struct InterruptFrame;

#define PIT_BASE_FREQUENCY 1193182
#define PIT_DEFAULT_HZ     1000

// I/O Port Addresses
#define PIT_CHANNEL0_DATA_PORT 0x40
#define PIT_CHANNEL1_DATA_PORT 0x41
#define PIT_CHANNEL2_DATA_PORT 0x42
#define PIT_COMMAND_PORT       0x43

// Command Register Settings
#define PIT_CMD_CHANNEL0       0x00
#define PIT_CMD_ACCESS_LOHI    0x30
#define PIT_CMD_MODE_RATE_GEN  0x04
#define PIT_CMD_MODE_SQUARE    0x06
#define PIT_CMD_BINARY         0x00

#ifdef __cplusplus
extern "C" {
#endif

void pit_init(uint32_t frequency_hz = PIT_DEFAULT_HZ);
uint64_t pit_get_ticks(void);
uint64_t pit_get_uptime_ms(void);
void pit_sleep_ms(uint64_t ms);
void pit_timer_handler(InterruptFrame* frame);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_ARCH_PIT_H
