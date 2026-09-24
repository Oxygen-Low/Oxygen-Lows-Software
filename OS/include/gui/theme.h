#ifndef OXYGEN_GUI_THEME_H
#define OXYGEN_GUI_THEME_H

#include "types.h"
#include "gui/graphics.h"

enum ThemeType : uint32_t {
    THEME_OXYGEN_CYAN = 0,
    THEME_MIDNIGHT_DARK,
    THEME_MATRIX_EMERALD,
    THEME_ROYAL_PURPLE,
    THEME_SOLAR_LIGHT,
    THEME_COUNT
};

struct Theme {
    const char* name;
    
    // Desktop Wallpaper
    Color wallpaper_top;
    Color wallpaper_bottom;
    Color wallpaper_grid;
    Color wallpaper_watermark_main;
    Color wallpaper_watermark_sub;

    // Taskbar
    Color taskbar_top;
    Color taskbar_bottom;
    Color taskbar_highlight;
    Color taskbar_text;
    Color taskbar_clock;
    Color start_btn_bg;
    Color start_btn_active;
    Color start_btn_border;
    Color tab_active;
    Color tab_inactive;
    Color tab_border;

    // Windows & Frames
    Color titlebar_active_top;
    Color titlebar_active_bottom;
    Color titlebar_inactive_top;
    Color titlebar_inactive_bottom;
    Color titlebar_text_active;
    Color titlebar_text_inactive;
    Color window_border_active;
    Color window_border_inactive;
    Color window_border_inner;
    Color panel_bg;
    Color panel_text;
    Color shadow_color;

    // Accents & Buttons
    Color accent;
    Color close_btn;
    Color min_btn;
    Color max_btn;
};

#ifdef __cplusplus
extern "C" {
#endif

void         theme_init(void);
const Theme* theme_get_current(void);
ThemeType    theme_get_current_type(void);
bool         theme_set_current(ThemeType type);
bool         theme_set_by_name(const char* name);
void         theme_cycle_next(void);
size_t       theme_get_count(void);
const Theme* theme_get_by_index(size_t index);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_THEME_H
