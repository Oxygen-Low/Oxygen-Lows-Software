#include "gui/theme.h"
#include "drivers/serial.h"

namespace {

static const Theme g_themes[THEME_COUNT] = {
    // 0: Oxygen Cyan (Default signature branding)
    {
        "Oxygen Cyan",
        Color(11, 19, 43, 255),          // wallpaper_top
        Color(28, 37, 65, 255),          // wallpaper_bottom
        Color(255, 255, 255, 6),         // wallpaper_grid
        Color(0, 229, 255, 120),         // wallpaper_watermark_main
        Color(148, 163, 184, 100),       // wallpaper_watermark_sub
        Color(15, 23, 42, 240),          // taskbar_top
        Color(28, 37, 65, 250),          // taskbar_bottom
        Color(8, 131, 149, 255),         // taskbar_highlight
        Color(148, 163, 184, 255),       // taskbar_text
        Color(0, 229, 255, 255),         // taskbar_clock
        Color(10, 77, 104, 255),         // start_btn_bg
        Color(8, 131, 149, 255),         // start_btn_active
        Color(0, 229, 255, 180),         // start_btn_border
        Color(8, 131, 149, 255),         // tab_active
        Color(30, 41, 59, 200),          // tab_inactive
        Color(51, 65, 85, 255),          // tab_border
        Color(10, 77, 104, 255),         // titlebar_active_top
        Color(8, 131, 149, 255),         // titlebar_active_bottom
        Color(30, 41, 59, 255),          // titlebar_inactive_top
        Color(51, 65, 85, 255),          // titlebar_inactive_bottom
        COLOR_WHITE,                     // titlebar_text_active
        Color(148, 163, 184, 255),       // titlebar_text_inactive
        Color(8, 131, 149, 255),         // window_border_active
        Color(30, 41, 59, 255),          // window_border_inactive
        Color(15, 23, 42, 255),          // window_border_inner
        Color(15, 23, 42, 255),          // panel_bg
        Color(241, 245, 249, 255),       // panel_text
        Color(0, 0, 0, 80),              // shadow_color
        Color(0, 229, 255, 255),         // accent
        COLOR_CLOSE_RED,                 // close_btn
        COLOR_MIN_BLUE,                  // min_btn
        Color(34, 197, 94, 255)          // max_btn (emerald green)
    },
    // 1: Midnight Dark
    {
        "Midnight Dark",
        Color(10, 10, 15, 255),          // wallpaper_top
        Color(20, 20, 30, 255),          // wallpaper_bottom
        Color(255, 255, 255, 4),         // wallpaper_grid
        Color(130, 140, 160, 100),       // wallpaper_watermark_main
        Color(90, 100, 120, 80),         // wallpaper_watermark_sub
        Color(12, 12, 18, 245),          // taskbar_top
        Color(20, 20, 28, 255),          // taskbar_bottom
        Color(70, 70, 90, 255),          // taskbar_highlight
        Color(160, 160, 175, 255),       // taskbar_text
        Color(220, 220, 235, 255),       // taskbar_clock
        Color(30, 30, 45, 255),          // start_btn_bg
        Color(50, 50, 75, 255),          // start_btn_active
        Color(80, 80, 110, 200),         // start_btn_border
        Color(45, 45, 65, 255),          // tab_active
        Color(25, 25, 35, 200),          // tab_inactive
        Color(45, 45, 60, 255),          // tab_border
        Color(35, 35, 50, 255),          // titlebar_active_top
        Color(25, 25, 38, 255),          // titlebar_active_bottom
        Color(20, 20, 28, 255),          // titlebar_inactive_top
        Color(15, 15, 22, 255),          // titlebar_inactive_bottom
        COLOR_WHITE,                     // titlebar_text_active
        Color(120, 120, 135, 255),       // titlebar_text_inactive
        Color(65, 65, 85, 255),          // window_border_active
        Color(30, 30, 40, 255),          // window_border_inactive
        Color(10, 10, 15, 255),          // window_border_inner
        Color(14, 14, 20, 255),          // panel_bg
        Color(225, 225, 235, 255),       // panel_text
        Color(0, 0, 0, 110),             // shadow_color
        Color(120, 130, 170, 255),       // accent
        Color(220, 50, 50, 255),         // close_btn
        Color(70, 100, 150, 255),        // min_btn
        Color(50, 160, 90, 255)          // max_btn
    },
    // 2: Matrix Emerald
    {
        "Matrix Emerald",
        Color(5, 15, 5, 255),            // wallpaper_top
        Color(10, 30, 12, 255),          // wallpaper_bottom
        Color(0, 255, 65, 8),            // wallpaper_grid
        Color(0, 255, 65, 140),          // wallpaper_watermark_main
        Color(0, 180, 50, 100),          // wallpaper_watermark_sub
        Color(8, 22, 10, 245),           // taskbar_top
        Color(14, 35, 16, 255),          // taskbar_bottom
        Color(0, 200, 60, 255),          // taskbar_highlight
        Color(140, 220, 150, 255),       // taskbar_text
        Color(0, 255, 65, 255),          // taskbar_clock
        Color(12, 45, 18, 255),          // start_btn_bg
        Color(20, 80, 30, 255),          // start_btn_active
        Color(0, 255, 65, 200),          // start_btn_border
        Color(18, 65, 25, 255),          // tab_active
        Color(10, 30, 14, 200),          // tab_inactive
        Color(0, 120, 40, 255),          // tab_border
        Color(15, 60, 22, 255),          // titlebar_active_top
        Color(25, 95, 35, 255),          // titlebar_active_bottom
        Color(12, 30, 15, 255),          // titlebar_inactive_top
        Color(18, 45, 22, 255),          // titlebar_inactive_bottom
        Color(220, 255, 220, 255),       // titlebar_text_active
        Color(100, 160, 110, 255),       // titlebar_text_inactive
        Color(0, 200, 60, 255),          // window_border_active
        Color(20, 50, 25, 255),          // window_border_inactive
        Color(5, 18, 8, 255),            // window_border_inner
        Color(6, 20, 10, 255),           // panel_bg
        Color(200, 255, 210, 255),       // panel_text
        Color(0, 0, 0, 95),              // shadow_color
        Color(0, 255, 65, 255),          // accent
        Color(220, 50, 50, 255),         // close_btn
        Color(30, 120, 60, 255),         // min_btn
        Color(0, 220, 80, 255)           // max_btn
    },
    // 3: Royal Purple
    {
        "Royal Purple",
        Color(25, 10, 35, 255),          // wallpaper_top
        Color(45, 18, 60, 255),          // wallpaper_bottom
        Color(255, 255, 255, 6),         // wallpaper_grid
        Color(216, 112, 255, 130),       // wallpaper_watermark_main
        Color(170, 120, 210, 100),       // wallpaper_watermark_sub
        Color(30, 12, 42, 245),          // taskbar_top
        Color(50, 20, 70, 255),          // taskbar_bottom
        Color(168, 85, 247, 255),        // taskbar_highlight
        Color(216, 180, 254, 255),       // taskbar_text
        Color(240, 171, 252, 255),       // taskbar_clock
        Color(76, 29, 149, 255),         // start_btn_bg
        Color(126, 34, 206, 255),        // start_btn_active
        Color(216, 112, 255, 190),       // start_btn_border
        Color(107, 33, 168, 255),        // tab_active
        Color(48, 18, 68, 200),          // tab_inactive
        Color(126, 34, 206, 255),        // tab_border
        Color(88, 28, 135, 255),         // titlebar_active_top
        Color(126, 34, 206, 255),        // titlebar_active_bottom
        Color(45, 18, 62, 255),          // titlebar_inactive_top
        Color(65, 25, 88, 255),          // titlebar_inactive_bottom
        COLOR_WHITE,                     // titlebar_text_active
        Color(192, 132, 252, 255),       // titlebar_text_inactive
        Color(168, 85, 247, 255),        // window_border_active
        Color(58, 24, 80, 255),          // window_border_inactive
        Color(20, 8, 30, 255),           // window_border_inner
        Color(24, 12, 34, 255),          // panel_bg
        Color(243, 232, 255, 255),       // panel_text
        Color(0, 0, 0, 90),              // shadow_color
        Color(216, 112, 255, 255),       // accent
        Color(225, 29, 72, 255),         // close_btn
        Color(147, 51, 234, 255),        // min_btn
        Color(74, 222, 128, 255)         // max_btn
    },
    // 4: Solar Light
    {
        "Solar Light",
        Color(224, 231, 245, 255),       // wallpaper_top
        Color(241, 245, 249, 255),       // wallpaper_bottom
        Color(15, 23, 42, 8),            // wallpaper_grid
        Color(14, 116, 144, 140),        // wallpaper_watermark_main
        Color(71, 85, 105, 120),         // wallpaper_watermark_sub
        Color(248, 250, 252, 245),       // taskbar_top
        Color(226, 232, 240, 255),       // taskbar_bottom
        Color(14, 116, 144, 255),        // taskbar_highlight
        Color(51, 65, 85, 255),          // taskbar_text
        Color(14, 116, 144, 255),        // taskbar_clock
        Color(207, 225, 245, 255),       // start_btn_bg
        Color(186, 215, 245, 255),       // start_btn_active
        Color(14, 116, 144, 180),        // start_btn_border
        Color(215, 230, 248, 255),       // tab_active
        Color(241, 245, 249, 200),       // tab_inactive
        Color(203, 213, 225, 255),       // tab_border
        Color(14, 116, 144, 255),        // titlebar_active_top
        Color(2, 132, 199, 255),         // titlebar_active_bottom
        Color(203, 213, 225, 255),       // titlebar_inactive_top
        Color(226, 232, 240, 255),       // titlebar_inactive_bottom
        COLOR_WHITE,                     // titlebar_text_active
        Color(71, 85, 105, 255),         // titlebar_text_inactive
        Color(14, 116, 144, 255),        // window_border_active
        Color(203, 213, 225, 255),       // window_border_inactive
        Color(241, 245, 249, 255),       // window_border_inner
        Color(255, 255, 255, 255),       // panel_bg
        Color(15, 23, 42, 255),          // panel_text
        Color(0, 0, 0, 35),              // shadow_color
        Color(14, 116, 144, 255),        // accent
        Color(239, 68, 68, 255),         // close_btn
        Color(2, 132, 199, 255),         // min_btn
        Color(34, 197, 94, 255)          // max_btn
    }
};

static ThemeType g_current_theme = THEME_OXYGEN_CYAN;

static bool str_case_eq(const char* s1, const char* s2) {
    if (!s1 || !s2) return false;
    while (*s1 && *s2) {
        char c1 = *s1;
        char c2 = *s2;
        if (c1 >= 'A' && c1 <= 'Z') c1 += ('a' - 'A');
        if (c2 >= 'A' && c2 <= 'Z') c2 += ('a' - 'A');
        if (c1 != c2) return false;
        s1++;
        s2++;
    }
    return *s1 == *s2;
}

} // anonymous namespace

extern "C" {

void theme_init(void) {
    g_current_theme = THEME_OXYGEN_CYAN;
    serial_printf("[THEME] Dynamic theme engine initialized with %u themes\n", (uint32_t)THEME_COUNT);
}

const Theme* theme_get_current(void) {
    return &g_themes[g_current_theme];
}

ThemeType theme_get_current_type(void) {
    return g_current_theme;
}

bool theme_set_current(ThemeType type) {
    if (type >= THEME_COUNT) return false;
    g_current_theme = type;
    serial_printf("[THEME] Switched theme to: %s\n", g_themes[g_current_theme].name);
    return true;
}

bool theme_set_by_name(const char* name) {
    if (!name) return false;
    for (size_t i = 0; i < THEME_COUNT; ++i) {
        if (str_case_eq(name, g_themes[i].name) ||
            (str_case_eq(name, "dark") && i == THEME_MIDNIGHT_DARK) ||
            (str_case_eq(name, "matrix") && i == THEME_MATRIX_EMERALD) ||
            (str_case_eq(name, "purple") && i == THEME_ROYAL_PURPLE) ||
            (str_case_eq(name, "light") && i == THEME_SOLAR_LIGHT) ||
            (str_case_eq(name, "oxygen") && i == THEME_OXYGEN_CYAN) ||
            (str_case_eq(name, "cyan") && i == THEME_OXYGEN_CYAN)) {
            g_current_theme = static_cast<ThemeType>(i);
            serial_printf("[THEME] Switched theme to: %s\n", g_themes[g_current_theme].name);
            return true;
        }
    }
    return false;
}

void theme_cycle_next(void) {
    g_current_theme = static_cast<ThemeType>((g_current_theme + 1) % THEME_COUNT);
    serial_printf("[THEME] Cycled theme to: %s\n", g_themes[g_current_theme].name);
}

size_t theme_get_count(void) {
    return THEME_COUNT;
}

const Theme* theme_get_by_index(size_t index) {
    if (index >= THEME_COUNT) return nullptr;
    return &g_themes[index];
}

} // extern "C"
