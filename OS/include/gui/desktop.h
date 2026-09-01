#ifndef OXYGEN_GUI_DESKTOP_H
#define OXYGEN_GUI_DESKTOP_H

#include "types.h"
#include "gui/graphics.h"
#include "gui/window.h"

#define DESKTOP_TASKBAR_HEIGHT 32
#define DESKTOP_START_BTN_W    88
#define DESKTOP_START_BTN_H    24
#define DESKTOP_START_MENU_W   220
#define DESKTOP_START_MENU_H   260

struct SystemTime {
    uint8_t hours;
    uint8_t minutes;
    uint8_t seconds;
};

#ifdef __cplusplus
extern "C" {
#endif

void       desktop_init(void);
void       desktop_render(void);
void       desktop_update(void);
bool       desktop_handle_mouse(int32_t x, int32_t y, uint8_t buttons);
bool       desktop_handle_key(uint8_t scancode, char ascii);
void       desktop_toggle_start_menu(void);
bool       desktop_is_start_menu_open(void);
SystemTime desktop_get_system_time(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_DESKTOP_H
