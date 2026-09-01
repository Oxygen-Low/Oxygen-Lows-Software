#include "drivers/keyboard.h"
#include "arch/x86_64/idt.h"
#include "arch/x86_64/pic.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

#define KEY_BUFFER_SIZE 128

KeyEvent g_key_buffer[KEY_BUFFER_SIZE];
volatile size_t g_buf_head = 0;
volatile size_t g_buf_tail = 0;

uint8_t g_modifiers = 0;
bool g_extended = false;

// Standard US QWERTY Scancode Set 1 (Unshifted)
const char g_scancode_unshifted[128] = {
    0,   27,  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '\b',
    '\t', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\n',
    0,   'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', '`',
    0,   '\\', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 0,
    '*', 0,   ' ', 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0
};

// Standard US QWERTY Scancode Set 1 (Shifted)
const char g_scancode_shifted[128] = {
    0,   27,  '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '\b',
    '\t', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}', '\n',
    0,   'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', '~',
    0,   '|', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?', 0,
    '*', 0,   ' ', 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0
};

} // anonymous namespace

extern "C" {

void keyboard_handler(InterruptFrame* frame) {
    UNUSED(frame);

    uint8_t scancode = inb(0x60);
    pic_send_eoi(IRQ_KEYBOARD);

    if (scancode == 0xE0) {
        g_extended = true;
        return;
    }

    bool released = (scancode & 0x80) != 0;
    uint8_t code = scancode & 0x7F;

    // Handle Modifier Keys
    if (code == 0x2A || code == 0x36) { // Left or Right Shift
        if (released) {
            g_modifiers &= ~KEY_MOD_SHIFT;
        } else {
            g_modifiers |= KEY_MOD_SHIFT;
        }
    } else if (code == 0x1D) { // Ctrl
        if (released) {
            g_modifiers &= ~KEY_MOD_CTRL;
        } else {
            g_modifiers |= KEY_MOD_CTRL;
        }
    } else if (code == 0x38) { // Alt
        if (released) {
            g_modifiers &= ~KEY_MOD_ALT;
        } else {
            g_modifiers |= KEY_MOD_ALT;
        }
    } else if (code == 0x3A && !released) { // CapsLock (toggle on press)
        g_modifiers ^= KEY_MOD_CAPSLOCK;
    }

    // Determine ASCII character
    char ascii = 0;
    if (code < sizeof(g_scancode_unshifted)) {
        bool shift_active = (g_modifiers & KEY_MOD_SHIFT) != 0;
        bool caps_active = (g_modifiers & KEY_MOD_CAPSLOCK) != 0;

        char c_unshift = g_scancode_unshifted[code];
        char c_shift = g_scancode_shifted[code];

        if (c_unshift >= 'a' && c_unshift <= 'z') {
            // Letter case modified by both Shift and CapsLock
            if (shift_active ^ caps_active) {
                ascii = c_shift;
            } else {
                ascii = c_unshift;
            }
        } else {
            // Symbols and digits affected only by Shift
            ascii = shift_active ? c_shift : c_unshift;
        }
    }

    // Push into circular event buffer
    size_t next_head = (g_buf_head + 1) % KEY_BUFFER_SIZE;
    if (next_head != g_buf_tail) {
        KeyEvent evt;
        evt.scancode = scancode;
        evt.ascii = ascii;
        evt.pressed = !released;
        evt.modifiers = g_modifiers | (g_extended ? KEY_MOD_EXTENDED : 0);
        g_key_buffer[g_buf_head] = evt;
        g_buf_head = next_head;
    }

    g_extended = false;
}

void keyboard_init(void) {
    // Flush any pending data in keyboard controller output buffer
    while (inb(0x64) & 1) {
        inb(0x60);
    }

    // Register IRQ1 handler in IDT (Vector 33)
    register_interrupt_handler(PIC1_VECTOR_OFFSET + IRQ_KEYBOARD, keyboard_handler);

    // Unmask IRQ1 on PIC
    pic_clear_mask(IRQ_KEYBOARD);

    serial_printf("[DRV] PS/2 keyboard initialized\n");
}

bool keyboard_has_key(void) {
    return g_buf_head != g_buf_tail;
}

KeyEvent keyboard_get_key(void) {
    KeyEvent evt = { 0, 0, false, 0 };
    if (g_buf_head == g_buf_tail) {
        return evt;
    }
    evt = g_key_buffer[g_buf_tail];
    g_buf_tail = (g_buf_tail + 1) % KEY_BUFFER_SIZE;
    return evt;
}

char keyboard_get_char(void) {
    while (keyboard_has_key()) {
        KeyEvent evt = keyboard_get_key();
        if (evt.pressed && evt.ascii != 0) {
            return evt.ascii;
        }
    }
    return 0;
}

} // extern "C"
