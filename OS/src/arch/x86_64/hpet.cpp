#include "arch/x86_64/hpet.h"
#include "arch/x86_64/acpi.h"
#include "mm/vmm.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

bool     g_hpet_available = false;
uint64_t g_hpet_base_addr = 0xFED00000ULL;
uint32_t g_hpet_period_fs = 0; // Femtoseconds per tick (10^-15 sec)
uint64_t g_hpet_frequency = 0; // Ticks per second (Hz)
uint64_t g_hpet_initial_counter = 0;

inline uint64_t hpet_read_reg(uint32_t offset) {
    auto* reg = reinterpret_cast<volatile uint64_t*>(g_hpet_base_addr + offset);
    return *reg;
}

inline void hpet_write_reg(uint32_t offset, uint64_t value) {
    auto* reg = reinterpret_cast<volatile uint64_t*>(g_hpet_base_addr + offset);
    *reg = value;
    __asm__ volatile ("mfence" ::: "memory");
}

} // anonymous namespace

extern "C" {

bool hpet_init(void) {
    g_hpet_available = false;
    g_hpet_period_fs = 0;
    g_hpet_frequency = 0;

    // 1. Locate HPET table in ACPI
    auto* acpi_hdr = acpi_find_table("HPET");
    if (acpi_hdr) {
        auto* hpet_table = reinterpret_cast<HPETTable*>(acpi_hdr);
        g_hpet_base_addr = hpet_table->base_address.address;
        serial_printf("[HPET] Found ACPI HPET table at 0x%p, base address = 0x%p\n",
                      reinterpret_cast<void*>(hpet_table),
                      reinterpret_cast<void*>(g_hpet_base_addr));
    } else {
        // Fallback to standard motherboard default MMIO address
        g_hpet_base_addr = 0xFED00000ULL;
        serial_printf("[HPET] ACPI HPET table not found, attempting default MMIO 0xFED00000\n");
    }

    // 2. Map HPET MMIO page in VMM
    vmm_map_page(g_hpet_base_addr, g_hpet_base_addr,
                 PAGE_PRESENT | PAGE_WRITABLE | PAGE_CACHE_DISABLE);

    // 3. Read General Capabilities and Period
    uint64_t cap = hpet_read_reg(HPET_REG_CAPABILITIES_AND_ID);
    g_hpet_period_fs = static_cast<uint32_t>(cap >> 32);

    // Validate period (typical range 10,000,000 to 100,000,000 fs: 10MHz to 100MHz)
    if (g_hpet_period_fs == 0 || g_hpet_period_fs > 1000000000U) {
        serial_printf("[HPET] Invalid HPET period (%u fs), HPET disabled\n", g_hpet_period_fs);
        return false;
    }

    g_hpet_frequency = 1000000000000000ULL / g_hpet_period_fs;
    serial_printf("[HPET] Capabilities: Period=%u fs, Frequency=%llu Hz\n",
                  g_hpet_period_fs, g_hpet_frequency);

    // 4. Enable HPET Main Counter
    uint64_t conf = hpet_read_reg(HPET_REG_CONFIGURATION);
    conf |= HPET_CONF_ENABLE;
    hpet_write_reg(HPET_REG_CONFIGURATION, conf);

    // Verify counter is ticking
    uint64_t t1 = hpet_read_reg(HPET_REG_MAIN_COUNTER);
    for (volatile int i = 0; i < 1000; ++i) { io_wait(); }
    uint64_t t2 = hpet_read_reg(HPET_REG_MAIN_COUNTER);

    if (t2 == t1) {
        serial_printf("[HPET] Warning: HPET counter did not advance\n");
        return false;
    }

    g_hpet_initial_counter = t1;
    g_hpet_available = true;

    serial_printf("[HPET] High Precision Event Timer initialized successfully\n");
    return true;
}

bool hpet_is_available(void) {
    return g_hpet_available;
}

uint64_t hpet_get_frequency(void) {
    return g_hpet_frequency;
}

uint32_t hpet_get_period_fs(void) {
    return g_hpet_period_fs;
}

uint64_t hpet_read_counter(void) {
    if (!g_hpet_available) return 0;
    return hpet_read_reg(HPET_REG_MAIN_COUNTER);
}

uint64_t hpet_get_nanoseconds(void) {
    if (!g_hpet_available || g_hpet_period_fs == 0) return 0;
    uint64_t current = hpet_read_counter();
    uint64_t elapsed = current - g_hpet_initial_counter;
    // 128-bit math prevents overflow: (elapsed * period_fs) / 1,000,000
    unsigned __int128 total_fs = (unsigned __int128)elapsed * g_hpet_period_fs;
    return static_cast<uint64_t>(total_fs / 1000000ULL);
}

uint64_t hpet_get_microseconds(void) {
    return hpet_get_nanoseconds() / 1000ULL;
}

uint64_t hpet_get_milliseconds(void) {
    return hpet_get_nanoseconds() / 1000000ULL;
}

void hpet_sleep_ns(uint64_t ns) {
    if (!g_hpet_available || g_hpet_period_fs == 0) {
        pit_sleep_ms((ns + 999999) / 1000000);
        return;
    }

    uint64_t start_ticks = hpet_read_counter();
    uint64_t target_ticks = (ns * 1000000ULL) / g_hpet_period_fs;

    while ((hpet_read_counter() - start_ticks) < target_ticks) {
        __asm__ volatile ("pause");
    }
}

void hpet_sleep_us(uint64_t us) {
    hpet_sleep_ns(us * 1000ULL);
}

void hpet_sleep_ms(uint64_t ms) {
    hpet_sleep_ns(ms * 1000000ULL);
}

} // extern "C"
