#ifndef OXYGEN_GUI_VGA_TEXT_H
#define OXYGEN_GUI_VGA_TEXT_H

#include "types.h"

#ifdef __cplusplus
extern "C" {
#endif

void vga_text_init(void);
bool vga_text_is_active(void);
void vga_text_render_desktop(void);
void vga_text_handle_key(uint8_t scancode, char ascii);
void vga_text_write_string(int row, int col, const char* str, uint8_t attr);
void vga_text_clear(uint8_t attr);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_VGA_TEXT_H
