#ifndef OXYGEN_APPS_APP_H
#define OXYGEN_APPS_APP_H

#include "types.h"
#include "gui/graphics.h"

struct Window;

class Application {
public:
    virtual ~Application() {}
    virtual void on_init(Window* window) { UNUSED(window); }
    virtual void on_paint(const Rect& client_area) = 0;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
        UNUSED(local_x); UNUSED(local_y); UNUSED(buttons);
    }
    virtual void on_mouse_up(int32_t local_x, int32_t local_y, uint8_t buttons) {
        UNUSED(local_x); UNUSED(local_y); UNUSED(buttons);
    }
    virtual void on_mouse_move(int32_t local_x, int32_t local_y) {
        UNUSED(local_x); UNUSED(local_y);
    }
    virtual void on_key_down(uint8_t scancode, char ascii) {
        UNUSED(scancode); UNUSED(ascii);
    }
    virtual void on_close() {}
    virtual void on_update() {}
};

#endif // OXYGEN_APPS_APP_H
