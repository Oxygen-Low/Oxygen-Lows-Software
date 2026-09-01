#ifndef OXYGEN_DRIVERS_MOUSE_H
#define OXYGEN_DRIVERS_MOUSE_H

#include "types.h"

struct InterruptFrame;

struct MouseState {
    int32_t x;
    int32_t y;
    int32_t delta_x;
    int32_t delta_y;
    bool    left_button;
    bool    right_button;
    bool    middle_button;
};

#ifdef __cplusplus
extern "C" {
#endif

void mouse_init(uint32_t screen_w = 1024, uint32_t screen_h = 768);
void mouse_handler(InterruptFrame* frame);
MouseState mouse_get_state(void);
void mouse_set_bounds(uint32_t screen_w, uint32_t screen_h);
void mouse_set_position(int32_t x, int32_t y);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_MOUSE_H
