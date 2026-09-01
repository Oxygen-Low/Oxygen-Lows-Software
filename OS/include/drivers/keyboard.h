#ifndef OXYGEN_DRIVERS_KEYBOARD_H
#define OXYGEN_DRIVERS_KEYBOARD_H

#include "types.h"

struct InterruptFrame;

// Key Modifier Flags
#define KEY_MOD_SHIFT     (1 << 0)
#define KEY_MOD_CTRL      (1 << 1)
#define KEY_MOD_ALT       (1 << 2)
#define KEY_MOD_CAPSLOCK  (1 << 3)
#define KEY_MOD_EXTENDED  (1 << 4)

// Special Key Codes
#define KEY_BACKSPACE     '\b'
#define KEY_TAB           '\t'
#define KEY_ENTER         '\n'
#define KEY_ESC           0x1B

// Extended / Function Key Codes (encoded in scancode / high byte)
#define KEY_SCAN_UP       0x48
#define KEY_SCAN_DOWN     0x50
#define KEY_SCAN_LEFT     0x4B
#define KEY_SCAN_RIGHT    0x4D
#define KEY_SCAN_DELETE   0x53
#define KEY_SCAN_HOME     0x47
#define KEY_SCAN_END      0x4F
#define KEY_SCAN_PAGEUP   0x49
#define KEY_SCAN_PAGEDOWN 0x51

struct KeyEvent {
    uint8_t scancode;
    char    ascii;
    bool    pressed;       // true = press, false = release
    uint8_t modifiers;     // Bitmask of KEY_MOD_*
};

#ifdef __cplusplus
extern "C" {
#endif

void keyboard_init(void);
void keyboard_handler(InterruptFrame* frame);
bool keyboard_has_key(void);
KeyEvent keyboard_get_key(void);
char keyboard_get_char(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_KEYBOARD_H
