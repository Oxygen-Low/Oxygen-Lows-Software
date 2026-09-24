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

// Software Cursor Save-Behind Buffer API
void    cursor_save_behind(int32_t x, int32_t y);
void    cursor_restore_behind(void);
bool    cursor_update_position(int32_t new_x, int32_t new_y);
int32_t cursor_get_current_x(void);
int32_t cursor_get_current_y(void);
bool    cursor_has_saved(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_CURSOR_H
