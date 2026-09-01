#include "gui/graphics.h"
#include "drivers/serial.h"

#define MAX_CLIP_STACK 16

static FramebufferConfig* g_gfx_fb = nullptr;
static Rect g_clip_stack[MAX_CLIP_STACK];
static int32_t g_clip_stack_depth = 0;
static Rect g_active_clip = Rect(0, 0, 1024, 768);

static inline Color blend_pixel(Color dst, Color src) {
    if (src.a == 255) return src;
    if (src.a == 0) return dst;
    uint32_t a = src.a;
    uint32_t inv_a = 255 - a;
    uint8_t r = static_cast<uint8_t>((src.r * a + dst.r * inv_a) / 255);
    uint8_t g = static_cast<uint8_t>((src.g * a + dst.g * inv_a) / 255);
    uint8_t b = static_cast<uint8_t>((src.b * a + dst.b * inv_a) / 255);
    return Color(r, g, b, 255);
}

void gfx_init(FramebufferConfig* config) {
    g_gfx_fb = config;
    if (g_gfx_fb) {
        g_active_clip = Rect(0, 0, g_gfx_fb->width, g_gfx_fb->height);
    } else {
        g_active_clip = Rect(0, 0, 1024, 768);
    }
    g_clip_stack_depth = 0;
    serial_printf("[GFX] Double-buffered software blitter initialized\n");
}

void gfx_set_clip_rect(const Rect& rect) {
    if (!g_gfx_fb) return;
    Rect screen(0, 0, g_gfx_fb->width, g_gfx_fb->height);
    g_active_clip = rect.intersect(screen);
}

Rect gfx_get_clip_rect(void) {
    return g_active_clip;
}

void gfx_reset_clip_rect(void) {
    if (!g_gfx_fb) return;
    g_active_clip = Rect(0, 0, g_gfx_fb->width, g_gfx_fb->height);
    g_clip_stack_depth = 0;
}

void gfx_push_clip_rect(const Rect& rect) {
    if (g_clip_stack_depth < MAX_CLIP_STACK) {
        g_clip_stack[g_clip_stack_depth++] = g_active_clip;
        g_active_clip = g_active_clip.intersect(rect);
    }
}

void gfx_pop_clip_rect(void) {
    if (g_clip_stack_depth > 0) {
        g_active_clip = g_clip_stack[--g_clip_stack_depth];
    }
}

void gfx_put_pixel(int32_t x, int32_t y, Color color) {
    if (!g_gfx_fb || !g_gfx_fb->backbuffer) return;
    if (!g_active_clip.contains(x, y)) return;

    uint32_t* buffer = g_gfx_fb->backbuffer;
    size_t index = static_cast<size_t>(y) * g_gfx_fb->width + x;

    if (color.a == 255) {
        buffer[index] = color.to_u32();
    } else if (color.a > 0) {
        Color existing(buffer[index]);
        Color blended = blend_pixel(existing, color);
        buffer[index] = blended.to_u32();
    }
}

Color gfx_get_pixel(int32_t x, int32_t y) {
    if (!g_gfx_fb || !g_gfx_fb->backbuffer) return COLOR_BLACK;
    if (x < 0 || x >= static_cast<int32_t>(g_gfx_fb->width) ||
        y < 0 || y >= static_cast<int32_t>(g_gfx_fb->height)) {
        return COLOR_BLACK;
    }
    return Color(g_gfx_fb->backbuffer[y * g_gfx_fb->width + x]);
}

void gfx_fill_rect(int32_t x, int32_t y, int32_t w, int32_t h, Color color) {
    if (!g_gfx_fb || !g_gfx_fb->backbuffer) return;
    if (color.a == 0) return;

    Rect target(x, y, w, h);
    Rect clipped = target.intersect(g_active_clip);
    if (clipped.is_empty()) return;

    uint32_t* buffer = g_gfx_fb->backbuffer;
    size_t screen_w = g_gfx_fb->width;

    if (color.a == 255) {
        uint32_t pixel_val = color.to_u32();
        for (int32_t row = clipped.y; row < clipped.y + clipped.height; ++row) {
            uint32_t* row_ptr = &buffer[row * screen_w + clipped.x];
            for (int32_t col = 0; col < clipped.width; ++col) {
                row_ptr[col] = pixel_val;
            }
        }
    } else {
        for (int32_t row = clipped.y; row < clipped.y + clipped.height; ++row) {
            uint32_t* row_ptr = &buffer[row * screen_w + clipped.x];
            for (int32_t col = 0; col < clipped.width; ++col) {
                Color existing(row_ptr[col]);
                row_ptr[col] = blend_pixel(existing, color).to_u32();
            }
        }
    }
}

void gfx_draw_rect(int32_t x, int32_t y, int32_t w, int32_t h, Color color) {
    if (w <= 0 || h <= 0) return;
    gfx_fill_rect(x, y, w, 1, color);                  // Top
    gfx_fill_rect(x, y + h - 1, w, 1, color);          // Bottom
    gfx_fill_rect(x, y + 1, 1, h - 2 > 0 ? h - 2 : 0, color); // Left
    gfx_fill_rect(x + w - 1, y + 1, 1, h - 2 > 0 ? h - 2 : 0, color); // Right
}

void gfx_draw_line(int32_t x0, int32_t y0, int32_t x1, int32_t y1, Color color) {
    int32_t dx = (x1 >= x0) ? (x1 - x0) : (x0 - x1);
    int32_t sx = (x0 < x1) ? 1 : -1;
    int32_t dy = (y1 >= y0) ? (y0 - y1) : (y1 - y0);
    int32_t sy = (y0 < y1) ? 1 : -1;
    int32_t err = dx + dy;

    while (true) {
        gfx_put_pixel(x0, y0, color);
        if (x0 == x1 && y0 == y1) break;
        int32_t e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

void gfx_draw_circle(int32_t xc, int32_t yc, int32_t r, Color color) {
    if (r < 0) return;
    int32_t x = 0;
    int32_t y = r;
    int32_t d = 3 - 2 * r;

    while (y >= x) {
        gfx_put_pixel(xc + x, yc + y, color);
        gfx_put_pixel(xc - x, yc + y, color);
        gfx_put_pixel(xc + x, yc - y, color);
        gfx_put_pixel(xc - x, yc - y, color);
        gfx_put_pixel(xc + y, yc + x, color);
        gfx_put_pixel(xc - y, yc + x, color);
        gfx_put_pixel(xc + y, yc - x, color);
        gfx_put_pixel(xc - y, yc - x, color);

        if (d < 0) {
            d = d + 4 * x + 6;
        } else {
            d = d + 4 * (x - y) + 10;
            y--;
        }
        x++;
    }
}

void gfx_fill_circle(int32_t xc, int32_t yc, int32_t r, Color color) {
    if (r < 0) return;
    int32_t x = 0;
    int32_t y = r;
    int32_t d = 3 - 2 * r;

    while (y >= x) {
        gfx_fill_rect(xc - x, yc + y, 2 * x + 1, 1, color);
        gfx_fill_rect(xc - x, yc - y, 2 * x + 1, 1, color);
        gfx_fill_rect(xc - y, yc + x, 2 * y + 1, 1, color);
        gfx_fill_rect(xc - y, yc - x, 2 * y + 1, 1, color);

        if (d < 0) {
            d = d + 4 * x + 6;
        } else {
            d = d + 4 * (x - y) + 10;
            y--;
        }
        x++;
    }
}

void gfx_draw_rounded_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, Color color) {
    if (w <= 0 || h <= 0) return;
    if (r <= 0) {
        gfx_draw_rect(x, y, w, h, color);
        return;
    }
    if (2 * r > w) r = w / 2;
    if (2 * r > h) r = h / 2;

    gfx_fill_rect(x + r, y, w - 2 * r, 1, color);
    gfx_fill_rect(x + r, y + h - 1, w - 2 * r, 1, color);
    gfx_fill_rect(x, y + r, 1, h - 2 * r, color);
    gfx_fill_rect(x + w - 1, y + r, 1, h - 2 * r, color);

    int32_t cx = 0;
    int32_t cy = r;
    int32_t d = 3 - 2 * r;
    while (cy >= cx) {
        gfx_put_pixel(x + r - cx, y + r - cy, color);
        gfx_put_pixel(x + r - cy, y + r - cx, color);
        gfx_put_pixel(x + w - 1 - r + cx, y + r - cy, color);
        gfx_put_pixel(x + w - 1 - r + cy, y + r - cx, color);
        gfx_put_pixel(x + r - cx, y + h - 1 - r + cy, color);
        gfx_put_pixel(x + r - cy, y + h - 1 - r + cx, color);
        gfx_put_pixel(x + w - 1 - r + cx, y + h - 1 - r + cy, color);
        gfx_put_pixel(x + w - 1 - r + cy, y + h - 1 - r + cx, color);

        if (d < 0) {
            d = d + 4 * cx + 6;
        } else {
            d = d + 4 * (cx - cy) + 10;
            cy--;
        }
        cx++;
    }
}

void gfx_fill_rounded_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, Color color) {
    if (w <= 0 || h <= 0) return;
    if (r <= 0) {
        gfx_fill_rect(x, y, w, h, color);
        return;
    }
    if (2 * r > w) r = w / 2;
    if (2 * r > h) r = h / 2;

    gfx_fill_rect(x + r, y, w - 2 * r, h, color);
    gfx_fill_rect(x, y + r, r, h - 2 * r, color);
    gfx_fill_rect(x + w - r, y + r, r, h - 2 * r, color);

    int32_t cx = 0;
    int32_t cy = r;
    int32_t d = 3 - 2 * r;
    while (cy >= cx) {
        gfx_fill_rect(x + r - cy, y + r - cx, cy, 1, color);
        gfx_fill_rect(x + r - cx, y + r - cy, cx, 1, color);
        gfx_fill_rect(x + w - r, y + r - cx, cy, 1, color);
        gfx_fill_rect(x + w - r, y + r - cy, cx, 1, color);

        gfx_fill_rect(x + r - cy, y + h - 1 - r + cx, cy, 1, color);
        gfx_fill_rect(x + r - cx, y + h - 1 - r + cy, cx, 1, color);
        gfx_fill_rect(x + w - r, y + h - 1 - r + cx, cy, 1, color);
        gfx_fill_rect(x + w - r, y + h - 1 - r + cy, cx, 1, color);

        if (d < 0) {
            d = d + 4 * cx + 6;
        } else {
            d = d + 4 * (cx - cy) + 10;
            cy--;
        }
        cx++;
    }
}

void gfx_draw_gradient_v(int32_t x, int32_t y, int32_t w, int32_t h, Color top, Color bottom) {
    if (w <= 0 || h <= 0) return;
    for (int32_t row = 0; row < h; ++row) {
        int32_t factor = (row * 255) / (h > 1 ? (h - 1) : 1);
        int32_t inv_factor = 255 - factor;

        uint8_t r = static_cast<uint8_t>((top.r * inv_factor + bottom.r * factor) / 255);
        uint8_t g = static_cast<uint8_t>((top.g * inv_factor + bottom.g * factor) / 255);
        uint8_t b = static_cast<uint8_t>((top.b * inv_factor + bottom.b * factor) / 255);
        uint8_t a = static_cast<uint8_t>((top.a * inv_factor + bottom.a * factor) / 255);

        gfx_fill_rect(x, y + row, w, 1, Color(r, g, b, a));
    }
}

void gfx_draw_gradient_h(int32_t x, int32_t y, int32_t w, int32_t h, Color left, Color right) {
    if (w <= 0 || h <= 0) return;
    for (int32_t col = 0; col < w; ++col) {
        int32_t factor = (col * 255) / (w > 1 ? (w - 1) : 1);
        int32_t inv_factor = 255 - factor;

        uint8_t r = static_cast<uint8_t>((left.r * inv_factor + right.r * factor) / 255);
        uint8_t g = static_cast<uint8_t>((left.g * inv_factor + right.g * factor) / 255);
        uint8_t b = static_cast<uint8_t>((left.b * inv_factor + right.b * factor) / 255);
        uint8_t a = static_cast<uint8_t>((left.a * inv_factor + right.a * factor) / 255);

        gfx_fill_rect(x + col, y, 1, h, Color(r, g, b, a));
    }
}

void gfx_blit_bitmap(int32_t dx, int32_t dy, int32_t w, int32_t h, const uint32_t* src, int32_t src_pitch, uint32_t key_transparent) {
    if (!g_gfx_fb || !src || w <= 0 || h <= 0) return;
    size_t pitch_pixels = src_pitch / sizeof(uint32_t);

    for (int32_t row = 0; row < h; ++row) {
        int32_t target_y = dy + row;
        if (target_y < g_active_clip.y || target_y >= g_active_clip.y + g_active_clip.height) continue;

        const uint32_t* src_row = &src[row * pitch_pixels];
        for (int32_t col = 0; col < w; ++col) {
            int32_t target_x = dx + col;
            if (target_x < g_active_clip.x || target_x >= g_active_clip.x + g_active_clip.width) continue;

            uint32_t pixel = src_row[col];
            if (pixel != key_transparent) {
                gfx_put_pixel(target_x, target_y, Color(pixel));
            }
        }
    }
}

void gfx_blit_alpha(int32_t dx, int32_t dy, int32_t w, int32_t h, const uint32_t* src, int32_t src_pitch) {
    if (!g_gfx_fb || !src || w <= 0 || h <= 0) return;
    size_t pitch_pixels = src_pitch / sizeof(uint32_t);

    for (int32_t row = 0; row < h; ++row) {
        int32_t target_y = dy + row;
        if (target_y < g_active_clip.y || target_y >= g_active_clip.y + g_active_clip.height) continue;

        const uint32_t* src_row = &src[row * pitch_pixels];
        for (int32_t col = 0; col < w; ++col) {
            int32_t target_x = dx + col;
            if (target_x < g_active_clip.x || target_x >= g_active_clip.x + g_active_clip.width) continue;

            gfx_put_pixel(target_x, target_y, Color(src_row[col]));
        }
    }
}

void gfx_clear(Color color) {
    if (!g_gfx_fb) return;
    Rect screen(0, 0, g_gfx_fb->width, g_gfx_fb->height);
    Rect old_clip = g_active_clip;
    g_active_clip = screen;
    gfx_fill_rect(0, 0, g_gfx_fb->width, g_gfx_fb->height, color);
    g_active_clip = old_clip;
}

void gfx_present(void) {
    fb_swap_buffers();
}

void gfx_present_rect(const Rect& rect) {
    fb_swap_rect(rect.x, rect.y, rect.width, rect.height);
}
