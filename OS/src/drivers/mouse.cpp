#include "drivers/mouse.h"
#include "arch/x86_64/idt.h"
#include "arch/x86_64/pic.h"
#include "arch/x86_64/pit.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

uint8_t g_mouse_cycle = 0;
uint8_t g_mouse_packet[3] = { 0, 0, 0 };
uint64_t g_last_packet_time = 0;

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
    uint32_t timeout = 1000;
    while (timeout-- && (inb(0x64) & 0x01)) {
        inb(0x60);
    }
    g_mouse_cycle = 0;
}

void mouse_handler(InterruptFrame* frame) {
    UNUSED(frame);

    uint8_t status = inb(0x64);
    // Ensure output buffer is full and that data originates from auxiliary (mouse) device
    if (!(status & 0x01) || !(status & 0x20)) {
        // Data not ready or not from mouse; acknowledge PIC anyway
        pic_send_eoi(IRQ_MOUSE);
        return;
    }

    uint8_t data = inb(0x60);
    pic_send_eoi(IRQ_MOUSE);

    // If an inter-packet gap exceeds 50ms, the previous packet was incomplete/dropped.
    // Reset the cycle so this new incoming byte is treated as start of packet.
    uint64_t now = pit_get_uptime_ms();
    if (g_mouse_cycle > 0 && (now - g_last_packet_time > 50)) {
        g_mouse_cycle = 0;
    }
    g_last_packet_time = now;

    switch (g_mouse_cycle) {
        case 0:
            // Sync check: Bit 3 of byte 0 must be 1, and overflow bits 6 & 7 must be 0
            if ((data & 0x08) == 0 || (data & 0xC0) != 0) {
                // Out of sync; discard and wait for valid start-of-packet
                g_mouse_cycle = 0;
                return;
            }
            g_mouse_packet[0] = data;
            g_mouse_cycle = 1;
            break;

        case 1:
            g_mouse_packet[1] = data;
            g_mouse_cycle = 2;
            break;

        case 2: {
            g_mouse_packet[2] = data;
            g_mouse_cycle = 0;

            // Packet header sanity verification
            if ((g_mouse_packet[0] & 0x08) == 0 || (g_mouse_packet[0] & 0xC0) != 0) {
                return;
            }

            // Extract movement deltas with accurate 9-bit sign expansion
            int32_t delta_x = 0;
            int32_t delta_y = 0;

            if (g_mouse_packet[0] & 0x10) {
                // Negative X delta
                delta_x = (int32_t)(int8_t)g_mouse_packet[1];
                if (delta_x > 0) delta_x -= 256;
            } else {
                // Positive X delta
                delta_x = (int32_t)(uint8_t)g_mouse_packet[1];
                if (delta_x > 127) delta_x = 0;
            }

            if (g_mouse_packet[0] & 0x20) {
                // Negative Y delta
                delta_y = (int32_t)(int8_t)g_mouse_packet[2];
                if (delta_y > 0) delta_y -= 256;
            } else {
                // Positive Y delta
                delta_y = (int32_t)(uint8_t)g_mouse_packet[2];
                if (delta_y > 127) delta_y = 0;
            }

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
            g_mouse_state.left_button = (g_mouse_packet[0] & 0x01) != 0;
            g_mouse_state.right_button = (g_mouse_packet[0] & 0x02) != 0;
            g_mouse_state.middle_button = (g_mouse_packet[0] & 0x04) != 0;
            break;
        }
    }
}

void mouse_init(uint32_t screen_w, uint32_t screen_h) {
    g_screen_width = (screen_w > 0) ? screen_w : 1024;
    g_screen_height = (screen_h > 0) ? screen_h : 768;
    g_mouse_state.x = g_screen_width / 2;
    g_mouse_state.y = g_screen_height / 2;
    g_mouse_cycle = 0;
    g_last_packet_time = 0;

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

    // Set mouse default sampling rate and settings (0xF6)
    mouse_write_command(0xF6);
    mouse_read_data(); // ACK (0xFA)

    // Enable data packet streaming (0xF4)
    mouse_write_command(0xF4);
    mouse_read_data(); // ACK (0xFA)

    // Flush any residual bytes after enabling data streaming
    mouse_flush();

    // Register IRQ12 in IDT (Vector 44 = PIC2_VECTOR_OFFSET + (12 - 8) = 40 + 4 = 44)
    register_interrupt_handler(PIC2_VECTOR_OFFSET + (IRQ_MOUSE - 8), mouse_handler);

    // Unmask Cascade IRQ2 and Mouse IRQ12 on PIC
    pic_clear_mask(IRQ_CASCADE);
    pic_clear_mask(IRQ_MOUSE);

    serial_printf("[DRV] PS/2 mouse initialized\n");
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
