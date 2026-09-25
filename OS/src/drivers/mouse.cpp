#include "drivers/mouse.h"
#include "arch/x86_64/idt.h"
#include "arch/x86_64/pic.h"
#include "arch/x86_64/pit.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

uint8_t g_mouse_cycle = 0;
uint8_t g_mouse_packet[4] = { 0, 0, 0, 0 };
uint8_t g_mouse_packet_size = 3;
uint64_t g_last_packet_time = 0;
uint32_t g_packet_debug_count = 0;

int32_t g_screen_width = 1024;
int32_t g_screen_height = 768;

MouseState g_mouse_state = {
    512, 384, // Initial centered position
    0, 0,
    false, false, false
};

void mouse_wait_input(void) {
    uint32_t timeout = 100000;
    while (timeout-- && (inb(0x64) & 0x02)) {
        io_wait();
    }
}

void mouse_wait_output(void) {
    uint32_t timeout = 100000;
    while (timeout-- && !(inb(0x64) & 0x01)) {
        io_wait();
    }
}

void mouse_write_command(uint8_t cmd) {
    mouse_wait_input();
    outb(0x64, 0xD4); // Tell controller next byte goes to mouse
    mouse_wait_input();
    outb(0x60, cmd);
}

uint8_t mouse_read_data(void) {
    mouse_wait_output();
    return inb(0x60);
}

} // anonymous namespace

extern "C" {

void mouse_flush(void) {
    uint32_t timeout = 2000;
    while (timeout-- && (inb(0x64) & 0x01)) {
        inb(0x60);
    }
    g_mouse_cycle = 0;
}

void mouse_handler(InterruptFrame* frame) {
    UNUSED(frame);

    while (true) {
        uint8_t status = inb(0x64);
        // If output buffer is empty, stop draining
        if (!(status & 0x01)) {
            break;
        }

        // If data in buffer belongs to keyboard (bit 5 is 0), do not consume it
        if (!(status & 0x20)) {
            break;
        }

        uint8_t data = inb(0x60);
        uint64_t now = pit_get_uptime_ms();

        // If an inter-packet gap exceeds 25ms, previous packet was dropped.
        // Resync to start of packet.
        if (g_mouse_cycle > 0 && (now - g_last_packet_time > 25)) {
            g_mouse_cycle = 0;
        }
        g_last_packet_time = now;

        if (g_mouse_cycle == 0) {
            // Sync check: Bit 3 of byte 0 is ALWAYS 1 in PS/2 mouse protocol.
            // Overflow bits 6 and 7 must be 0 for standard packets to avoid framing errors.
            if ((data & 0x08) == 0 || (data & 0xC0) != 0) {
                // Out of sync byte; discard and wait for valid start-of-packet
                continue;
            }
            g_mouse_packet[0] = data;
            g_mouse_cycle = 1;
        } else if (g_mouse_cycle == 1) {
            g_mouse_packet[1] = data;
            g_mouse_cycle = 2;
        } else if (g_mouse_cycle == 2) {
            g_mouse_packet[2] = data;
            if (g_mouse_packet_size > 3) {
                g_mouse_cycle = 3;
            } else {
                g_mouse_cycle = 0;
                goto process_packet;
            }
        } else if (g_mouse_cycle == 3) {
            g_mouse_packet[3] = data;
            g_mouse_cycle = 0;
            goto process_packet;
        }
        continue;

process_packet:
        // Direct 8-bit two's complement delta conversion (signed int8_t)
        int32_t delta_x = static_cast<int32_t>(static_cast<int8_t>(g_mouse_packet[1]));
        int32_t delta_y = static_cast<int32_t>(static_cast<int8_t>(g_mouse_packet[2]));

        // If overflow bits are set, discard movement
        if (g_mouse_packet[0] & 0x40) delta_x = 0;
        if (g_mouse_packet[0] & 0x80) delta_y = 0;

        // Screen Y axis increases downward, mouse delta Y increases upward
        delta_y = -delta_y;

        // Clamp deltas to prevent erratic jumps
        delta_x = CLAMP(delta_x, -100, 100);
        delta_y = CLAMP(delta_y, -100, 100);

        g_mouse_state.delta_x = delta_x;
        g_mouse_state.delta_y = delta_y;

        // Only update relative coordinates if absolute pointing device is not active
        extern bool vbox_guest_is_absolute_mouse_enabled(void);
        if (!vbox_guest_is_absolute_mouse_enabled()) {
            g_mouse_state.x = CLAMP(g_mouse_state.x + delta_x, 0, g_screen_width - 1);
            g_mouse_state.y = CLAMP(g_mouse_state.y + delta_y, 0, g_screen_height - 1);
        }

        // Update button states
        g_mouse_state.left_button   = (g_mouse_packet[0] & 0x01) != 0;
        g_mouse_state.right_button  = (g_mouse_packet[0] & 0x02) != 0;
        g_mouse_state.middle_button = (g_mouse_packet[0] & 0x04) != 0;

        if (g_packet_debug_count < 20) {
            g_packet_debug_count++;
            serial_printf("[MOUSE#%u] [%02x %02x %02x] dx=%d dy=%d pos=(%d,%d)\n",
                          g_packet_debug_count,
                          g_mouse_packet[0], g_mouse_packet[1], g_mouse_packet[2],
                          delta_x, delta_y, g_mouse_state.x, g_mouse_state.y);
        }
    }

    pic_send_eoi(IRQ_MOUSE);
}

void mouse_init(uint32_t screen_w, uint32_t screen_h) {
    g_screen_width = (screen_w > 0) ? screen_w : 1024;
    g_screen_height = (screen_h > 0) ? screen_h : 768;
    g_mouse_state.x = g_screen_width / 2;
    g_mouse_state.y = g_screen_height / 2;
    g_mouse_cycle = 0;
    g_last_packet_time = 0;
    g_mouse_packet_size = 3;

    // Flush any pending data before device configuration
    mouse_flush();

    // Enable auxiliary mouse device on 8042 controller
    mouse_wait_input();
    outb(0x64, 0xA8);

    // Read controller configuration byte
    mouse_wait_input();
    outb(0x64, 0x20);
    uint8_t config = mouse_read_data();

    // Enable IRQ12 (bit 1) and IRQ1 (bit 0), disable mouse clock inhibit (bit 5)
    config |= (1 << 1) | (1 << 0);
    config &= ~(1 << 5);

    // Write back configuration byte
    mouse_wait_input();
    outb(0x64, 0x60);
    mouse_wait_input();
    outb(0x60, config);

    // Disable data streaming initially so mouse doesn't flood buffers during kernel boot
    mouse_write_command(0xF5);
    mouse_read_data(); // ACK (0xFA)

    // Set mouse default sampling rate and settings (0xF6)
    mouse_write_command(0xF6);
    mouse_read_data(); // ACK (0xFA)

    // Query Device ID (0xF2) to verify if standard 3-byte or 4-byte wheel mouse
    mouse_write_command(0xF2);
    mouse_read_data(); // ACK (0xFA)
    uint8_t dev_id = mouse_read_data();
    if (dev_id == 3 || dev_id == 4) {
        g_mouse_packet_size = 4;
        serial_printf("[DRV] PS/2 mouse: IntelliMouse 4-byte mode detected (ID: 0x%02x)\n", dev_id);
    } else {
        g_mouse_packet_size = 3;
        serial_printf("[DRV] PS/2 mouse: Standard 3-byte mode detected (ID: 0x%02x)\n", dev_id);
    }

    // Flush any residual bytes while streaming is disabled
    mouse_flush();

    // Register IRQ12 in IDT (Vector 44 = PIC2_VECTOR_OFFSET + (12 - 8) = 40 + 4 = 44)
    register_interrupt_handler(PIC2_VECTOR_OFFSET + (IRQ_MOUSE - 8), mouse_handler);

    serial_printf("[DRV] PS/2 mouse initialized (packet size: %u)\n", g_mouse_packet_size);
}

void mouse_start(void) {
    // 1. Drain any residual bytes in 8042 controller before streaming
    mouse_flush();

    // 2. Enable data packet streaming (0xF4) while IRQ is masked to avoid ACK byte race
    mouse_write_command(0xF4);
    mouse_read_data(); // ACK (0xFA)

    // 3. Flush any residual bytes and reset synchronization state
    mouse_flush();
    g_mouse_cycle = 0;
    g_last_packet_time = pit_get_uptime_ms();

    // 4. Unmask Cascade IRQ2 and Mouse IRQ12 on PIC
    pic_clear_mask(IRQ_CASCADE);
    pic_clear_mask(IRQ_MOUSE);

    serial_printf("[DRV] PS/2 mouse data streaming enabled\n");
}

MouseState mouse_get_state(void) {
    uint64_t rflags;
    __asm__ volatile ("pushfq; pop %0; cli" : "=r"(rflags) :: "memory");
    MouseState state = g_mouse_state;
    __asm__ volatile ("push %0; popfq" :: "r"(rflags) : "memory");
    return state;
}

void mouse_set_bounds(uint32_t screen_w, uint32_t screen_h) {
    if (screen_w > 0) g_screen_width = screen_w;
    if (screen_h > 0) g_screen_height = screen_h;
}

void mouse_set_position(int32_t x, int32_t y) {
    uint64_t rflags;
    __asm__ volatile ("pushfq; pop %0; cli" : "=r"(rflags) :: "memory");
    g_mouse_state.x = CLAMP(x, 0, g_screen_width - 1);
    g_mouse_state.y = CLAMP(y, 0, g_screen_height - 1);
    __asm__ volatile ("push %0; popfq" :: "r"(rflags) : "memory");
}

} // extern "C"
