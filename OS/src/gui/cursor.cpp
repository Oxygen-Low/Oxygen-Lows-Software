#include "gui/cursor.h"
#include "gui/framebuffer.h"
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

static uint32_t g_cursor_save_buffer[CURSOR_HEIGHT][CURSOR_WIDTH];
static int32_t  g_saved_x = -1;
static int32_t  g_saved_y = -1;
static bool     g_has_saved = false;
static int32_t  g_current_cursor_x = 0;
static int32_t  g_current_cursor_y = 0;

void cursor_init(void) {
    g_has_saved = false;
    g_saved_x = -1;
    g_saved_y = -1;
    g_current_cursor_x = 0;
    g_current_cursor_y = 0;
}

void cursor_save_behind(int32_t x, int32_t y) {
    FramebufferConfig* fb = fb_get_config();
    if (!fb || !fb->backbuffer) return;

    uint32_t* backbuffer = fb->backbuffer;
    int32_t sw = static_cast<int32_t>(fb->width);
    int32_t sh = static_cast<int32_t>(fb->height);

    for (int32_t row = 0; row < CURSOR_HEIGHT; ++row) {
        for (int32_t col = 0; col < CURSOR_WIDTH; ++col) {
            int32_t px = x + col;
            int32_t py = y + row;
            if (px >= 0 && px < sw && py >= 0 && py < sh) {
                g_cursor_save_buffer[row][col] = backbuffer[py * sw + px];
            } else {
                g_cursor_save_buffer[row][col] = 0;
            }
        }
    }
    g_saved_x = x;
    g_saved_y = y;
    g_has_saved = true;
}

void cursor_restore_behind(void) {
    if (!g_has_saved) return;
    FramebufferConfig* fb = fb_get_config();
    if (!fb || !fb->backbuffer) return;

    uint32_t* backbuffer = fb->backbuffer;
    int32_t sw = static_cast<int32_t>(fb->width);
    int32_t sh = static_cast<int32_t>(fb->height);

    for (int32_t row = 0; row < CURSOR_HEIGHT; ++row) {
        for (int32_t col = 0; col < CURSOR_WIDTH; ++col) {
            int32_t px = g_saved_x + col;
            int32_t py = g_saved_y + row;
            if (px >= 0 && px < sw && py >= 0 && py < sh) {
                backbuffer[py * sw + px] = g_cursor_save_buffer[row][col];
            }
        }
    }
    g_has_saved = false;
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

bool cursor_update_position(int32_t new_x, int32_t new_y) {
    if (new_x == g_current_cursor_x && new_y == g_current_cursor_y && g_has_saved) {
        return false;
    }

    if (g_has_saved) {
        int32_t old_x = g_saved_x;
        int32_t old_y = g_saved_y;
        cursor_restore_behind();
        fb_mark_dirty(old_x, old_y, CURSOR_WIDTH, CURSOR_HEIGHT);
    }

    cursor_save_behind(new_x, new_y);
    cursor_render(new_x, new_y);
    fb_mark_dirty(new_x, new_y, CURSOR_WIDTH, CURSOR_HEIGHT);

    g_current_cursor_x = new_x;
    g_current_cursor_y = new_y;
    return true;
}

int32_t cursor_get_width(void) {
    return CURSOR_WIDTH;
}

int32_t cursor_get_height(void) {
    return CURSOR_HEIGHT;
}

int32_t cursor_get_current_x(void) {
    return g_current_cursor_x;
}

int32_t cursor_get_current_y(void) {
    return g_current_cursor_y;
}

bool cursor_has_saved(void) {
    return g_has_saved;
}
