#ifndef OXYGEN_APPS_PAINT_APP_H
#define OXYGEN_APPS_PAINT_APP_H

#include "apps/app.h"

enum PaintTool : uint8_t {
    TOOL_PENCIL = 0,
    TOOL_BRUSH,
    TOOL_LINE,
    TOOL_RECT,
    TOOL_FILLED_RECT,
    TOOL_CIRCLE,
    TOOL_ERASER,
    TOOL_COUNT
};

#define PAINT_CANVAS_W 500
#define PAINT_CANVAS_H 340
#define PAINT_PALETTE_SIZE 16

class PaintApp : public Application {
public:
    PaintApp();
    virtual ~PaintApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_mouse_up(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_mouse_move(int32_t local_x, int32_t local_y) override;
    virtual void on_resize(int32_t width, int32_t height) override;

    void clear_canvas(Color color = COLOR_WHITE);

private:
    Window*   m_window;
    PaintTool m_tool;
    Color     m_current_color;
    uint8_t   m_brush_size; // 1, 2, 4
    bool      m_is_drawing;
    
    int32_t   m_start_x;
    int32_t   m_start_y;
    int32_t   m_prev_x;
    int32_t   m_prev_y;

    uint32_t* m_canvas;

    void draw_canvas_pixel(int32_t x, int32_t y, Color color);
    void draw_canvas_brush(int32_t x, int32_t y, Color color, uint8_t size);
    void draw_canvas_line(int32_t x0, int32_t y0, int32_t x1, int32_t y1, Color color, uint8_t size);
    void draw_canvas_rect(int32_t x0, int32_t y0, int32_t x1, int32_t y1, Color color, bool filled);
    void draw_canvas_circle(int32_t xc, int32_t yc, int32_t r, Color color);
};

#endif // OXYGEN_APPS_PAINT_APP_H
