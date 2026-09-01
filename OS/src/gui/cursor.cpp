#include "gui/cursor.h"
#include "drivers/serial.h"

// 12x18 Arrow Cursor (0 = Transparent, 1 = Black Outline, 2 = White Body, 3 = Cyan Accent)
const uint8_t g_mouse_cursor_bitmap[CURSOR_HEIGHT][CURSOR_WIDTH] = {
    {1,0,0,0,0,0,0,0,0,0,0,0},
    {1,1,0,0,0,0,0,0,0,0,0,0},
    {1,2,1,0,0,0,0,0,0,0,0,0},
    {1,2,2,1,0,0,0,0,0,0,0,0},
    {1,2,3,2,1,0,0,0,0,0,0,0},
    {1,2,3,3,2,1,0,0,0,0,0,0},
    {1,2,3,3,3,2,1,0,0,0,0,0},
    {1,2,3,3,3,3,2,1,0,0,0,0},
    {1,2,3,3,3,3,3,2,1,0,0,0},
    {1,2,3,3,3,3,3,3,2,1,0,0},
    {1,2,3,3,3,2,1,1,1,1,0,0},
    {1,2,3,1,2,2,1,0,0,0,0,0},
    {1,2,1,0,1,2,2,1,0,0,0,0},
    {1,1,0,0,1,2,2,1,0,0,0,0},
    {1,0,0,0,0,1,2,2,1,0,0,0},
    {0,0,0,0,0,1,2,2,1,0,0,0},
    {0,0,0,0,0,0,1,1,0,0,0,0},
    {0,0,0,0,0,0,0,0,0,0,0,0}
};

static const Color COLOR_CURSOR_OUTLINE = Color(0, 0, 0, 255);
static const Color COLOR_CURSOR_BODY    = Color(255, 255, 255, 255);
static const Color COLOR_CURSOR_ACCENT  = Color(0, 180, 216, 255); // 0xFF00B4D8 Oxygen Cyan

void cursor_init(void) {
    // Initialized
}

void cursor_render(int32_t x, int32_t y) {
    for (int32_t row = 0; row < CURSOR_HEIGHT; ++row) {
        for (int32_t col = 0; col < CURSOR_WIDTH; ++col) {
            uint8_t pixel_type = g_mouse_cursor_bitmap[row][col];
            if (pixel_type == 1) {
                gfx_put_pixel(x + col, y + row, COLOR_CURSOR_OUTLINE);
            } else if (pixel_type == 2) {
                gfx_put_pixel(x + col, y + row, COLOR_CURSOR_BODY);
            } else if (pixel_type == 3) {
                gfx_put_pixel(x + col, y + row, COLOR_CURSOR_ACCENT);
            }
        }
    }
}

int32_t cursor_get_width(void) {
    return CURSOR_WIDTH;
}

int32_t cursor_get_height(void) {
    return CURSOR_HEIGHT;
}
