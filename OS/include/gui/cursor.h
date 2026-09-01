#ifndef OXYGEN_GUI_CURSOR_H
#define OXYGEN_GUI_CURSOR_H

#include "types.h"
#include "gui/graphics.h"

#define CURSOR_WIDTH  12
#define CURSOR_HEIGHT 18

extern const uint8_t g_mouse_cursor_bitmap[CURSOR_HEIGHT][CURSOR_WIDTH];

#ifdef __cplusplus
extern "C" {
#endif

void    cursor_init(void);
void    cursor_render(int32_t x, int32_t y);
int32_t cursor_get_width(void);
int32_t cursor_get_height(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_CURSOR_H
