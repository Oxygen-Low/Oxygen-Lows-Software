#ifndef OXYGEN_GUI_FONT_H
#define OXYGEN_GUI_FONT_H

#include "types.h"
#include "gui/graphics.h"

#define FONT_CHAR_WIDTH  8
#define FONT_CHAR_HEIGHT 16
#define FONT_LINE_SPACING 18

extern const uint8_t g_font8x16[256][16];

#ifdef __cplusplus
extern "C" {
#endif

void    font_draw_char(int32_t x, int32_t y, char c, Color fg, Color bg = COLOR_TRANSPARENT);
void    font_draw_string(int32_t x, int32_t y, const char* str, Color fg, Color bg = COLOR_TRANSPARENT);
void    font_draw_string_bounded(const Rect& bounds, int32_t x, int32_t y, const char* str, Color fg, Color bg = COLOR_TRANSPARENT);
void    font_printf(int32_t x, int32_t y, Color fg, Color bg, const char* fmt, ...) __attribute__((format(printf, 5, 6)));
void    font_printf_bounded(const Rect& bounds, int32_t x, int32_t y, Color fg, Color bg, const char* fmt, ...) __attribute__((format(printf, 6, 7)));
int32_t font_measure_string_width(const char* str);
int32_t font_get_char_width(void);
int32_t font_get_char_height(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_FONT_H
