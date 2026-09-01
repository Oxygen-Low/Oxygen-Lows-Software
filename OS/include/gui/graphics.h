#ifndef OXYGEN_GUI_GRAPHICS_H
#define OXYGEN_GUI_GRAPHICS_H

#include "types.h"
#include "gui/framebuffer.h"

// 32-bit ARGB Color Structure
struct Color {
    uint8_t b;
    uint8_t g;
    uint8_t r;
    uint8_t a;

    constexpr Color() : b(0), g(0), r(0), a(255) {}
    constexpr Color(uint8_t red, uint8_t green, uint8_t blue, uint8_t alpha = 255)
        : b(blue), g(green), r(red), a(alpha) {}
    constexpr Color(uint32_t argb)
        : b(static_cast<uint8_t>(argb & 0xFF)),
          g(static_cast<uint8_t>((argb >> 8) & 0xFF)),
          r(static_cast<uint8_t>((argb >> 16) & 0xFF)),
          a(static_cast<uint8_t>((argb >> 24) & 0xFF)) {}

    inline uint32_t to_u32() const {
        return (static_cast<uint32_t>(a) << 24) |
               (static_cast<uint32_t>(r) << 16) |
               (static_cast<uint32_t>(g) << 8)  |
               (static_cast<uint32_t>(b));
    }

    static constexpr Color from_argb(uint8_t a, uint8_t r, uint8_t g, uint8_t b) {
        return Color(r, g, b, a);
    }
    static constexpr Color from_rgb(uint8_t r, uint8_t g, uint8_t b) {
        return Color(r, g, b, 255);
    }
    static constexpr Color from_hex(uint32_t hex) {
        uint8_t a = (hex >> 24) & 0xFF;
        if (a == 0 && (hex & 0x00FFFFFF) != 0) a = 255;
        return Color(static_cast<uint8_t>((hex >> 16) & 0xFF),
                     static_cast<uint8_t>((hex >> 8) & 0xFF),
                     static_cast<uint8_t>(hex & 0xFF),
                     a);
    }
};

// Common Brand Color Constants for Oxygen Low's Software
#define COLOR_BLACK           Color(0, 0, 0, 255)
#define COLOR_WHITE           Color(255, 255, 255, 255)
#define COLOR_TRANSPARENT     Color(0, 0, 0, 0)
#define COLOR_DARK_BG         Color(11, 19, 43, 255)       // 0xFF0B132B
#define COLOR_NAVY_BG         Color(28, 37, 65, 255)       // 0xFF1C2541
#define COLOR_OXYGEN_CYAN     Color(0, 229, 255, 255)      // 0xFF00E5FF
#define COLOR_OXYGEN_BLUE     Color(8, 131, 149, 255)      // 0xFF088395
#define COLOR_OXYGEN_DEEP     Color(10, 77, 104, 255)      // 0xFF0A4D68
#define COLOR_LIGHT_SLATE     Color(241, 245, 249, 255)    // 0xFFF1F5F9
#define COLOR_GRAY            Color(148, 163, 184, 255)    // 0xFF94A3B8
#define COLOR_DARK_GRAY       Color(51, 65, 85, 255)       // 0xFF334155
#define COLOR_PANEL_BG        Color(15, 23, 42, 255)       // 0xFF0F172A
#define COLOR_CLOSE_RED       Color(230, 57, 70, 255)      // 0xFFE63946
#define COLOR_MIN_BLUE        Color(69, 123, 157, 255)     // 0xFF457B9D

// 2D Integer Rectangle for Layout and Clipping
struct Rect {
    int32_t x;
    int32_t y;
    int32_t width;
    int32_t height;

    constexpr Rect() : x(0), y(0), width(0), height(0) {}
    constexpr Rect(int32_t x_, int32_t y_, int32_t w_, int32_t h_)
        : x(x_), y(y_), width(w_), height(h_) {}

    inline bool is_empty() const {
        return width <= 0 || height <= 0;
    }

    inline bool contains(int32_t px, int32_t py) const {
        return px >= x && px < (x + width) && py >= y && py < (y + height);
    }

    inline bool intersects(const Rect& other) const {
        return !(x + width <= other.x || other.x + other.width <= x ||
                 y + height <= other.y || other.y + other.height <= y);
    }

    inline Rect intersect(const Rect& other) const {
        int32_t nx = (x > other.x) ? x : other.x;
        int32_t ny = (y > other.y) ? y : other.y;
        int32_t r1 = x + width;
        int32_t r2 = other.x + other.width;
        int32_t b1 = y + height;
        int32_t b2 = other.y + other.height;
        int32_t nr = (r1 < r2) ? r1 : r2;
        int32_t nb = (b1 < b2) ? b1 : b2;

        if (nr <= nx || nb <= ny) return Rect(0, 0, 0, 0);
        return Rect(nx, ny, nr - nx, nb - ny);
    }
};

#ifdef __cplusplus
extern "C" {
#endif

void gfx_init(FramebufferConfig* config);
void gfx_set_clip_rect(const Rect& rect);
Rect gfx_get_clip_rect(void);
void gfx_reset_clip_rect(void);
void gfx_push_clip_rect(const Rect& rect);
void gfx_pop_clip_rect(void);

// Primitive Rendering
void gfx_put_pixel(int32_t x, int32_t y, Color color);
Color gfx_get_pixel(int32_t x, int32_t y);
void gfx_fill_rect(int32_t x, int32_t y, int32_t w, int32_t h, Color color);
void gfx_draw_rect(int32_t x, int32_t y, int32_t w, int32_t h, Color color);
void gfx_draw_line(int32_t x0, int32_t y0, int32_t x1, int32_t y1, Color color);
void gfx_draw_circle(int32_t xc, int32_t yc, int32_t r, Color color);
void gfx_fill_circle(int32_t xc, int32_t yc, int32_t r, Color color);
void gfx_draw_rounded_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, Color color);
void gfx_fill_rounded_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, Color color);
void gfx_draw_gradient_v(int32_t x, int32_t y, int32_t w, int32_t h, Color top, Color bottom);
void gfx_draw_gradient_h(int32_t x, int32_t y, int32_t w, int32_t h, Color left, Color right);

// Bitmap Blitting and Compositing
void gfx_blit_bitmap(int32_t dx, int32_t dy, int32_t w, int32_t h, const uint32_t* src, int32_t src_pitch, uint32_t key_transparent = 0x00000000);
void gfx_blit_alpha(int32_t dx, int32_t dy, int32_t w, int32_t h, const uint32_t* src, int32_t src_pitch);

// Screen Operations
void gfx_clear(Color color);
void gfx_present(void);
void gfx_present_rect(const Rect& rect);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_GRAPHICS_H
