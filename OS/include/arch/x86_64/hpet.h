#ifndef OXYGEN_ARCH_HPET_H
#define OXYGEN_ARCH_HPET_H

#include "types.h"
#include "arch/x86_64/acpi.h"

// HPET ACPI Description Table
struct __attribute__((packed)) HPETTable {
    ACPITableHeader header;
    uint32_t event_timer_block_id;
    ACPI_GAS base_address;
    uint8_t  hpet_number;
    uint16_t main_counter_min_tick;
    uint8_t  page_protection_oem;
};

// HPET Register Offsets
#define HPET_REG_CAPABILITIES_AND_ID 0x000
#define HPET_REG_CONFIGURATION       0x010
#define HPET_REG_INTERRUPT_STATUS    0x020
#define HPET_REG_MAIN_COUNTER        0x0F0
#define HPET_REG_TIMER_CONFIG(n)     (0x100 + (n) * 0x20)
#define HPET_REG_TIMER_COMPARATOR(n) (0x108 + (n) * 0x20)

// HPET Configuration Register Bits
#define HPET_CONF_ENABLE             (1ULL << 0)
#define HPET_CONF_LEGACY_REPLACEMENT (1ULL << 1)

#ifdef __cplusplus
extern "C" {
#endif

// Initialization & Discovery
bool hpet_init(void);
bool hpet_is_available(void);
uint64_t hpet_get_frequency(void);
uint32_t hpet_get_period_fs(void);

// High-Precision Timing
uint64_t hpet_read_counter(void);
uint64_t hpet_get_nanoseconds(void);
uint64_t hpet_get_microseconds(void);
uint64_t hpet_get_milliseconds(void);

// High-Precision Sleep
void hpet_sleep_ns(uint64_t ns);
void hpet_sleep_us(uint64_t us);
void hpet_sleep_ms(uint64_t ms);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_ARCH_HPET_H
