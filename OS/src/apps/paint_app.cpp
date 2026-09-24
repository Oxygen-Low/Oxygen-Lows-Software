#include "apps/paint_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "gui/theme.h"
#include "mm/heap.h"

static const Color g_palette[PAINT_PALETTE_SIZE] = {
    Color(0, 0, 0, 255),          // Black
    Color(255, 255, 255, 255),    // White
    Color(239, 68, 68, 255),      // Red
    Color(34, 197, 94, 255),      // Green
    Color(59, 130, 246, 255),     // Blue
    Color(0, 229, 255, 255),      // Cyan
    Color(234, 179, 8, 255),      // Yellow
    Color(217, 70, 239, 255),     // Magenta
    Color(249, 115, 22, 255),     // Orange
    Color(168, 85, 247, 255),     // Purple
    Color(100, 116, 139, 255),    // Gray
    Color(15, 23, 42, 255),       // Dark Navy
    Color(20, 184, 166, 255),     // Teal
    Color(244, 63, 94, 255),      // Rose
    Color(132, 204, 22, 255),     // Lime
    Color(161, 98, 7, 255)        // Brown
};

PaintApp::PaintApp()
    : m_window(nullptr), m_tool(TOOL_PENCIL), m_current_color(Color(0, 0, 0, 255)),
      m_brush_size(2), m_is_drawing(false),
      m_start_x(0), m_start_y(0), m_prev_x(0), m_prev_y(0) {
    m_canvas = reinterpret_cast<uint32_t*>(kmalloc(PAINT_CANVAS_W * PAINT_CANVAS_H * sizeof(uint32_t)));
    clear_canvas(COLOR_WHITE);
}

PaintApp::~PaintApp() {
    if (m_canvas) {
        kfree(m_canvas);
        m_canvas = nullptr;
    }
}

void PaintApp::on_init(Window* window) {
    m_window = window;
    clear_canvas(COLOR_WHITE);
}

void PaintApp::on_resize(int32_t width, int32_t height) {
    UNUSED(width);
    UNUSED(height);
    if (m_window) m_window->is_dirty = true;
}

void PaintApp::clear_canvas(Color color) {
    if (!m_canvas) return;
    uint32_t val = color.to_u32();
    for (size_t i = 0; i < PAINT_CANVAS_W * PAINT_CANVAS_H; ++i) {
        m_canvas[i] = val;
    }
    if (m_window) m_window->is_dirty = true;
}

void PaintApp::draw_canvas_pixel(int32_t x, int32_t y, Color color) {
    if (!m_canvas || x < 0 || x >= PAINT_CANVAS_W || y < 0 || y >= PAINT_CANVAS_H) return;
    m_canvas[y * PAINT_CANVAS_W + x] = color.to_u32();
}

void PaintApp::draw_canvas_brush(int32_t x, int32_t y, Color color, uint8_t size) {
    int32_t rad = size;
    for (int32_t dy = -rad; dy <= rad; ++dy) {
        for (int32_t dx = -rad; dx <= rad; ++dx) {
            if (dx * dx + dy * dy <= rad * rad) {
                draw_canvas_pixel(x + dx, y + dy, color);
            }
        }
    }
}

void PaintApp::draw_canvas_line(int32_t x0, int32_t y0, int32_t x1, int32_t y1, Color color, uint8_t size) {
    int32_t dx = (x1 >= x0) ? (x1 - x0) : (x0 - x1);
    int32_t dy = (y1 >= y0) ? (y1 - y0) : (y0 - y1);
    int32_t sx = (x0 < x1) ? 1 : -1;
    int32_t sy = (y0 < y1) ? 1 : -1;
    int32_t err = dx - dy;

    while (true) {
        if (size <= 1) {
            draw_canvas_pixel(x0, y0, color);
        } else {
            draw_canvas_brush(x0, y0, color, size);
        }

        if (x0 == x1 && y0 == y1) break;
        int32_t e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
}

void PaintApp::draw_canvas_rect(int32_t x0, int32_t y0, int32_t x1, int32_t y1, Color color, bool filled) {
    int32_t min_x = (x0 < x1) ? x0 : x1;
    int32_t max_x = (x0 < x1) ? x1 : x0;
    int32_t min_y = (y0 < y1) ? y0 : y1;
    int32_t max_y = (y0 < y1) ? y1 : y0;

    if (filled) {
        for (int32_t y = min_y; y <= max_y; ++y) {
            for (int32_t x = min_x; x <= max_x; ++x) {
                draw_canvas_pixel(x, y, color);
            }
        }
    } else {
        for (int32_t x = min_x; x <= max_x; ++x) {
            draw_canvas_pixel(x, min_y, color);
            draw_canvas_pixel(x, max_y, color);
        }
        for (int32_t y = min_y; y <= max_y; ++y) {
            draw_canvas_pixel(min_x, y, color);
            draw_canvas_pixel(max_x, y, color);
        }
    }
}

void PaintApp::draw_canvas_circle(int32_t xc, int32_t yc, int32_t r, Color color) {
    int32_t x = 0;
    int32_t y = r;
    int32_t d = 3 - 2 * r;

    while (y >= x) {
        draw_canvas_pixel(xc + x, yc + y, color);
        draw_canvas_pixel(xc - x, yc + y, color);
        draw_canvas_pixel(xc + x, yc - y, color);
        draw_canvas_pixel(xc - x, yc - y, color);
        draw_canvas_pixel(xc + y, yc + x, color);
        draw_canvas_pixel(xc - y, yc + x, color);
        draw_canvas_pixel(xc + y, yc - x, color);
        draw_canvas_pixel(xc - y, yc - x, color);

        x++;
        if (d > 0) {
            y--;
            d = d + 4 * (x - y) + 10;
        } else {
            d = d + 4 * x + 6;
        }
    }
}

void PaintApp::on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
    if (!(buttons & 1)) return;

    // 1. Tool selection buttons in top toolbar (y: 4 to 28)
    if (local_y >= 4 && local_y <= 28) {
        int32_t bx = 8;
        for (int i = 0; i < 8; ++i) {
            if (local_x >= bx && local_x <= bx + 48) {
                if (i == 7) {
                    clear_canvas(COLOR_WHITE);
                } else {
                    m_tool = static_cast<PaintTool>(i);
                }
                if (m_window) m_window->is_dirty = true;
                return;
            }
            bx += 52;
        }

        // Brush size selector: 1px, 2px, 4px
        if (local_x >= 430 && local_x <= 450) { m_brush_size = 1; if (m_window) m_window->is_dirty = true; return; }
        if (local_x >= 454 && local_x <= 474) { m_brush_size = 2; if (m_window) m_window->is_dirty = true; return; }
        if (local_x >= 478 && local_x <= 498) { m_brush_size = 4; if (m_window) m_window->is_dirty = true; return; }
    }

    // 2. Color Palette Clicks (y: 34 to 54)
    if (local_y >= 34 && local_y <= 54) {
        int32_t px = 8;
        for (size_t i = 0; i < PAINT_PALETTE_SIZE; ++i) {
            if (local_x >= px && local_x <= px + 20) {
                m_current_color = g_palette[i];
                if (m_window) m_window->is_dirty = true;
                return;
            }
            px += 24;
        }
    }

    // 3. Canvas Drawing Area (y >= 60)
    int32_t canvas_x = 8;
    int32_t canvas_y = 60;
    if (local_x >= canvas_x && local_x < canvas_x + PAINT_CANVAS_W &&
        local_y >= canvas_y && local_y < canvas_y + PAINT_CANVAS_H) {
        m_is_drawing = true;
        int32_t cx = local_x - canvas_x;
        int32_t cy = local_y - canvas_y;
        m_start_x = cx;
        m_start_y = cy;
        m_prev_x = cx;
        m_prev_y = cy;

        Color draw_col = (m_tool == TOOL_ERASER) ? COLOR_WHITE : m_current_color;
        uint8_t sz = (m_tool == TOOL_ERASER) ? 8 : ((m_tool == TOOL_BRUSH) ? (m_brush_size * 2) : m_brush_size);

        if (m_tool == TOOL_PENCIL || m_tool == TOOL_BRUSH || m_tool == TOOL_ERASER) {
            draw_canvas_brush(cx, cy, draw_col, sz);
        }
        if (m_window) m_window->is_dirty = true;
    }
}

void PaintApp::on_mouse_move(int32_t local_x, int32_t local_y) {
    if (!m_is_drawing) return;

    int32_t canvas_x = 8;
    int32_t canvas_y = 60;
    int32_t cx = local_x - canvas_x;
    int32_t cy = local_y - canvas_y;

    if (cx < 0) cx = 0;
    if (cx >= PAINT_CANVAS_W) cx = PAINT_CANVAS_W - 1;
    if (cy < 0) cy = 0;
    if (cy >= PAINT_CANVAS_H) cy = PAINT_CANVAS_H - 1;

    Color draw_col = (m_tool == TOOL_ERASER) ? COLOR_WHITE : m_current_color;
    uint8_t sz = (m_tool == TOOL_ERASER) ? 8 : ((m_tool == TOOL_BRUSH) ? (m_brush_size * 2) : m_brush_size);

    if (m_tool == TOOL_PENCIL || m_tool == TOOL_BRUSH || m_tool == TOOL_ERASER) {
        draw_canvas_line(m_prev_x, m_prev_y, cx, cy, draw_col, sz);
        m_prev_x = cx;
        m_prev_y = cy;
        if (m_window) m_window->is_dirty = true;
    }
}

void PaintApp::on_mouse_up(int32_t local_x, int32_t local_y, uint8_t buttons) {
    UNUSED(buttons);
    if (!m_is_drawing) return;
    m_is_drawing = false;

    int32_t canvas_x = 8;
    int32_t canvas_y = 60;
    int32_t end_x = local_x - canvas_x;
    int32_t end_y = local_y - canvas_y;

    if (end_x < 0) end_x = 0;
    if (end_x >= PAINT_CANVAS_W) end_x = PAINT_CANVAS_W - 1;
    if (end_y < 0) end_y = 0;
    if (end_y >= PAINT_CANVAS_H) end_y = PAINT_CANVAS_H - 1;

    Color draw_col = (m_tool == TOOL_ERASER) ? COLOR_WHITE : m_current_color;

    if (m_tool == TOOL_LINE) {
        draw_canvas_line(m_start_x, m_start_y, end_x, end_y, draw_col, m_brush_size);
    } else if (m_tool == TOOL_RECT) {
        draw_canvas_rect(m_start_x, m_start_y, end_x, end_y, draw_col, false);
    } else if (m_tool == TOOL_FILLED_RECT) {
        draw_canvas_rect(m_start_x, m_start_y, end_x, end_y, draw_col, true);
    } else if (m_tool == TOOL_CIRCLE) {
        int32_t dx = end_x - m_start_x;
        int32_t dy = end_y - m_start_y;
        int32_t r = 0;
        int32_t dist_sq = dx * dx + dy * dy;
        // Integer square root approx
        while ((r + 1) * (r + 1) <= dist_sq) r++;
        draw_canvas_circle(m_start_x, m_start_y, r, draw_col);
    }

    if (m_window) m_window->is_dirty = true;
}

void PaintApp::on_paint(const Rect& client_area) {
    const Theme* theme = theme_get_current();

    // Background
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, Color(241, 245, 249, 255));

    // 1. Top Tool Buttons Bar
    int32_t bar_h = 30;
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, bar_h, Color(226, 232, 240, 255));
    gfx_fill_rect(client_area.x, client_area.y + bar_h - 1, client_area.width, 1, Color(203, 213, 225, 255));

    const char* tool_labels[] = { "Pen", "Brush", "Line", "Rect", "FRect", "Circle", "Eraser", "Clear" };
    int32_t bx = client_area.x + 8;
    for (int i = 0; i < 8; ++i) {
        bool active = (i < 7 && m_tool == static_cast<PaintTool>(i));
        Color btn_bg = active ? theme->accent : Color(255, 255, 255, 255);
        Color btn_text = active ? COLOR_BLACK : Color(15, 23, 42, 255);

        gfx_fill_rounded_rect(bx, client_area.y + 4, 48, 22, 3, btn_bg);
        gfx_draw_rounded_rect(bx, client_area.y + 4, 48, 22, 3, Color(203, 213, 225, 255));
        font_draw_string(bx + 6, client_area.y + 6, tool_labels[i], btn_text);
        bx += 52;
    }

    // Brush size indicators: 1, 2, 4
    font_draw_string(client_area.x + 400, client_area.y + 7, "Size:", Color(71, 85, 105, 255));
    for (int sz = 1; sz <= 3; ++sz) {
        int act_sz = (sz == 1) ? 1 : ((sz == 2) ? 2 : 4);
        int sx = client_area.x + 430 + (sz - 1) * 24;
        bool is_sz = (m_brush_size == act_sz);
        gfx_fill_rect(sx, client_area.y + 5, 20, 20, is_sz ? theme->accent : Color(255, 255, 255, 255));
        gfx_draw_rect(sx, client_area.y + 5, 20, 20, Color(203, 213, 225, 255));
        font_printf(sx + 6, client_area.y + 6, is_sz ? COLOR_BLACK : COLOR_BLACK, COLOR_TRANSPARENT, "%u", act_sz);
    }

    // 2. Color Palette Bar
    int32_t pal_y = client_area.y + 32;
    gfx_fill_rect(client_area.x, pal_y, client_area.width, 24, Color(248, 250, 252, 255));
    gfx_fill_rect(client_area.x, pal_y + 23, client_area.width, 1, Color(203, 213, 225, 255));

    int32_t px = client_area.x + 8;
    for (size_t i = 0; i < PAINT_PALETTE_SIZE; ++i) {
        gfx_fill_rect(px, pal_y + 2, 20, 20, g_palette[i]);
        gfx_draw_rect(px, pal_y + 2, 20, 20, Color(148, 163, 184, 255));
        if (g_palette[i].to_u32() == m_current_color.to_u32()) {
            gfx_draw_rect(px - 1, pal_y + 1, 22, 22, Color(0, 0, 0, 255));
        }
        px += 24;
    }

    // Active Color Preview Swatch
    font_draw_string(px + 10, pal_y + 4, "Active:", Color(71, 85, 105, 255));
    gfx_fill_rect(px + 60, pal_y + 2, 26, 20, m_current_color);
    gfx_draw_rect(px + 60, pal_y + 2, 26, 20, Color(15, 23, 42, 255));

    // 3. Canvas Viewport Blit
    int32_t canvas_screen_x = client_area.x + 8;
    int32_t canvas_screen_y = client_area.y + 60;

    // Drop shadow behind canvas
    gfx_fill_rect(canvas_screen_x + 3, canvas_screen_y + 3, PAINT_CANVAS_W, PAINT_CANVAS_H, Color(0, 0, 0, 60));

    // Border around canvas
    gfx_draw_rect(canvas_screen_x - 1, canvas_screen_y - 1, PAINT_CANVAS_W + 2, PAINT_CANVAS_H + 2, Color(148, 163, 184, 255));

    // Blit canvas bitmap
    if (m_canvas) {
        gfx_blit_bitmap(canvas_screen_x, canvas_screen_y, PAINT_CANVAS_W, PAINT_CANVAS_H, m_canvas, PAINT_CANVAS_W);
    }
}
