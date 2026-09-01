#include "arch/x86_64/pit.h"
#include "arch/x86_64/idt.h"
#include "arch/x86_64/pic.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

volatile uint64_t g_system_ticks = 0;
uint32_t g_pit_frequency = PIT_DEFAULT_HZ;

} // anonymous namespace

extern "C" {

void pit_timer_handler(InterruptFrame* frame) {
    UNUSED(frame);
    g_system_ticks++;
    pic_send_eoi(IRQ_TIMER);
}

void pit_init(uint32_t frequency_hz) {
    g_pit_frequency = (frequency_hz > 0) ? frequency_hz : PIT_DEFAULT_HZ;
    uint32_t divisor = PIT_BASE_FREQUENCY / g_pit_frequency;
    if (divisor == 0) divisor = 1;
    if (divisor > 65535) divisor = 65535;

    // Send command byte: Channel 0, Lobyle/Hibyte, Mode 3 (Square Wave), Binary
    outb(PIT_COMMAND_PORT, 0x36);
    io_wait();

    // Send divisor low byte then high byte
    outb(PIT_CHANNEL0_DATA_PORT, (uint8_t)(divisor & 0xFF));
    io_wait();
    outb(PIT_CHANNEL0_DATA_PORT, (uint8_t)((divisor >> 8) & 0xFF));
    io_wait();

    // Register IRQ0 handler in IDT (Vector 32)
    register_interrupt_handler(PIC1_VECTOR_OFFSET + IRQ_TIMER, pit_timer_handler);

    // Unmask IRQ0 on PIC
    pic_clear_mask(IRQ_TIMER);

    serial_printf("[PIT] 8254 Timer initialized at 1000Hz\n");
}

uint64_t pit_get_ticks(void) {
    return g_system_ticks;
}

uint64_t pit_get_uptime_ms(void) {
    if (g_pit_frequency == 0) return 0;
    return (g_system_ticks * 1000) / g_pit_frequency;
}

void pit_sleep_ms(uint64_t ms) {
    uint64_t start_ms = pit_get_uptime_ms();
    uint64_t loops = 0;
    while ((pit_get_uptime_ms() - start_ms) < ms) {
        __asm__ volatile ("pause");
        if (++loops > 2000000ULL * (ms > 0 ? ms : 1)) {
            break;
        }
    }
}

} // extern "C"
