#include "gui/desktop.h"
#include "gui/font.h"
#include "gui/cursor.h"
#include "gui/window.h"
#include "gui/theme.h"
#include "arch/x86_64/io.h"
#include "arch/x86_64/pit.h"
#include "mm/pmm.h"
#include "mm/heap.h"
#include "drivers/mouse.h"
#include "drivers/keyboard.h"
#include "drivers/serial.h"
#include "apps/services_app.h"
#include "apps/installer_app.h"

// Desktop Icon Structure
struct DesktopIcon {
    const char* label;
    const char* glyph;
    Color       glyph_bg;
    int32_t     x;
    int32_t     y;
    int32_t     w;
    int32_t     h;
    char        app_match_char; // Match first letter of window title
};

#define DESKTOP_ICON_COUNT 8
static DesktopIcon g_desktop_icons[DESKTOP_ICON_COUNT] = {
    { "Terminal",  ">_",  Color(15, 23, 42, 255),  24, 24,  64, 68, 'T' },
    { "SysInfo",   "[i]", Color(10, 77, 104, 255), 24, 102, 64, 68, 'S' },
    { "Calculator","[=]", Color(20, 80, 50, 255),  24, 180, 64, 68, 'C' },
    { "Notepad",   "[#]", Color(30, 41, 59, 255),  24, 258, 64, 68, 'N' },
    { "Explorer",  "[F]", Color(161, 98, 7, 255),  24, 336, 64, 68, 'F' },
    { "Task Mgr",  "[T]", Color(88, 28, 135, 255), 24, 414, 64, 68, ' ' },
    { "Paint",     "[P]", Color(190, 24, 93, 255), 24, 492, 64, 68, 'P' },
    { "Setup / OS","[+]", Color(13, 148, 136, 255),104, 24,  64, 68, 'O' }
};

static bool       g_start_menu_open = false;
static bool       g_context_menu_open = false;
static int32_t    g_context_menu_x = 0;
static int32_t    g_context_menu_y = 0;
static int32_t    g_selected_icon_idx = -1;

static SystemTime g_system_time = {0, 0, 0};
static uint64_t   g_last_time_update_ms = 0;
static bool       g_desktop_dirty = true;

void desktop_mark_dirty(void) {
    g_desktop_dirty = true;
}

bool desktop_is_dirty(void) {
    return g_desktop_dirty;
}

static uint8_t cmos_read(uint8_t reg) {
    outb(0x70, reg);
    return inb(0x71);
}

static uint8_t bcd_to_bin(uint8_t val) {
    return (val & 0x0F) + ((val >> 4) * 10);
}

static void update_clock(void) {
    uint64_t uptime_ms = pit_get_uptime_ms();
    if (uptime_ms - g_last_time_update_ms < 500) {
        return;
    }
    g_last_time_update_ms = uptime_ms;

    uint8_t status_b = cmos_read(0x0B);
    uint8_t sec = cmos_read(0x00);
    uint8_t min = cmos_read(0x02);
    uint8_t hr  = cmos_read(0x04);

    bool is_bcd = !(status_b & 0x04);
    if (is_bcd) {
        sec = bcd_to_bin(sec);
        min = bcd_to_bin(min);
        hr  = bcd_to_bin(hr);
    }

    if (!(status_b & 0x02) && (hr & 0x80)) {
        hr = ((hr & 0x7F) + 12) % 24;
    }

    if (hr >= 24 || min >= 60 || sec >= 60) {
        uint64_t total_sec = uptime_ms / 1000;
        sec = static_cast<uint8_t>(total_sec % 60);
        min = static_cast<uint8_t>((total_sec / 60) % 60);
        hr  = static_cast<uint8_t>((total_sec / 3600) % 24);
    }

    if (g_system_time.seconds != sec) {
        g_desktop_dirty = true;
    }

    g_system_time.hours = hr;
    g_system_time.minutes = min;
    g_system_time.seconds = sec;
}

void desktop_init(void) {
    g_start_menu_open = false;
    g_context_menu_open = false;
    g_selected_icon_idx = -1;
    g_system_time = {12, 0, 0};
    g_last_time_update_ms = 0;
    g_desktop_dirty = true;
    update_clock();

    serial_printf("[DESKTOP] Oxygen Low's Software desktop ready with clickable icons & context menu\n");
}

void desktop_toggle_start_menu(void) {
    g_start_menu_open = !g_start_menu_open;
    if (g_start_menu_open) g_context_menu_open = false;
    g_desktop_dirty = true;
}

bool desktop_is_start_menu_open(void) {
    return g_start_menu_open;
}

void desktop_open_context_menu(int32_t x, int32_t y) {
    int32_t screen_w = static_cast<int32_t>(fb_get_width());
    int32_t screen_h = static_cast<int32_t>(fb_get_height());

    g_context_menu_x = (x + 180 > screen_w) ? (screen_w - 184) : x;
    g_context_menu_y = (y + 200 > screen_h - 32) ? (screen_h - 32 - 204) : y;
    g_context_menu_open = true;
    g_start_menu_open = false;
    g_desktop_dirty = true;
}

void desktop_close_context_menu(void) {
    g_context_menu_open = false;
    g_desktop_dirty = true;
}

bool desktop_is_context_menu_open(void) {
    return g_context_menu_open;
}

SystemTime desktop_get_system_time(void) {
    return g_system_time;
}

void desktop_launch_app(uint8_t app_id) {
    g_desktop_dirty = true;
    char match = ' ';
    if (app_id < DESKTOP_ICON_COUNT) {
        match = g_desktop_icons[app_id].app_match_char;
    }

    if (app_id == 7) { // Setup / OS
        Window* w = wm_get_bottom_window();
        while (w) {
            if (w->title[0] == 'O' && w->title[1] == 'x' && w->title[2] == 'y' && w->title[3] == 'g') {
                wm_restore_window(w);
                return;
            }
            w = w->next;
        }
        wm_create_window("Oxygen Low's Software Setup & Maintenance",
                         120, 80, 680, 480,
                         WF_TITLEBAR | WF_CLOSABLE | WF_MINIMIZABLE, new InstallerApp());
        return;
    }

    if (app_id == 8) { // Services App from start menu
        Window* w = wm_get_bottom_window();
        while (w) {
            if (w->title[0] == 'S' && w->title[1] == 'e' && w->title[2] == 'r' && w->title[3] == 'v') {
                wm_restore_window(w);
                return;
            }
            w = w->next;
        }
        wm_create_window("Services - Oxygen Low's Software",
                         180, 100, 680, 440,
                         WF_TITLEBAR | WF_CLOSABLE | WF_MINIMIZABLE, new ServicesApp());
        return;
    }

    // Try finding existing window and restore/focus it
    Window* w = wm_get_bottom_window();
    while (w) {
        if (match != ' ' && w->title[0] == match) {
            wm_restore_window(w);
            return;
        } else if (match == ' ' && w->title[0] == 'T' && w->title[1] == 'a') { // Task Manager
            wm_restore_window(w);
            return;
        }
        w = w->next;
    }
}

static void render_wallpaper(int32_t screen_w, int32_t screen_h) {
    const Theme* theme = theme_get_current();

    // Themed Wallpaper Gradient
    gfx_draw_gradient_v(0, 0, screen_w, screen_h, theme->wallpaper_top, theme->wallpaper_bottom);

    // Subtle geometric accent grid lines
    for (int32_t y = 0; y < screen_h; y += 64) {
        gfx_fill_rect(0, y, screen_w, 1, theme->wallpaper_grid);
    }
    for (int32_t x = 0; x < screen_w; x += 64) {
        gfx_fill_rect(x, 0, 1, screen_h, theme->wallpaper_grid);
    }

    // Large Branded Watermark in Center
    const char* brand_text = "Oxygen Low's Software";
    const char* brand_sub  = "64-bit Desktop Operating System";

    int32_t brand_w = font_measure_string_width(brand_text);
    int32_t sub_w   = font_measure_string_width(brand_sub);

    int32_t center_x = (screen_w - brand_w) / 2;
    int32_t center_y = (screen_h - 60) / 2;

    font_draw_string(center_x + 2, center_y + 2, brand_text, Color(0, 0, 0, 180));
    font_draw_string(center_x, center_y, brand_text, theme->wallpaper_watermark_main);

    int32_t sub_x = (screen_w - sub_w) / 2;
    font_draw_string(sub_x, center_y + 24, brand_sub, theme->wallpaper_watermark_sub);
}

static void render_desktop_icons(void) {
    const Theme* theme = theme_get_current();

    for (size_t i = 0; i < DESKTOP_ICON_COUNT; ++i) {
        const DesktopIcon& icon = g_desktop_icons[i];
        bool is_selected = (static_cast<int32_t>(i) == g_selected_icon_idx);

        // Selection background highlight
        if (is_selected) {
            gfx_fill_rounded_rect(icon.x - 4, icon.y - 4, icon.w + 8, icon.h + 8, 4, Color(8, 131, 149, 100));
            gfx_draw_rounded_rect(icon.x - 4, icon.y - 4, icon.w + 8, icon.h + 8, 4, theme->accent);
        }

        // Icon Tile (38x38 centered)
        int32_t tile_x = icon.x + (icon.w - 38) / 2;
        int32_t tile_y = icon.y + 2;

        gfx_fill_rect(tile_x + 2, tile_y + 2, 38, 38, Color(0, 0, 0, 80)); // Shadow
        gfx_fill_rounded_rect(tile_x, tile_y, 38, 38, 6, icon.glyph_bg);
        gfx_draw_rounded_rect(tile_x, tile_y, 38, 38, 6, theme->accent);

        // Glyph inside tile
        int32_t gw = font_measure_string_width(icon.glyph);
        int32_t gx = tile_x + (38 - gw) / 2;
        int32_t gy = tile_y + 11;
        font_draw_string(gx, gy, icon.glyph, COLOR_WHITE);

        // Text label underneath
        int32_t lw = font_measure_string_width(icon.label);
        int32_t lx = icon.x + (icon.w - lw) / 2;
        int32_t ly = icon.y + 44;

        font_draw_string(lx + 1, ly + 1, icon.label, Color(0, 0, 0, 220)); // Shadow
        font_draw_string(lx, ly, icon.label, COLOR_WHITE);
    }
}

static void render_context_menu(void) {
    if (!g_context_menu_open) return;

    const Theme* theme = theme_get_current();
    int32_t mx = g_context_menu_x;
    int32_t my = g_context_menu_y;
    int32_t mw = 190;
    int32_t mh = 200;

    // Drop Shadow
    gfx_fill_rect(mx + 4, my + 4, mw, mh, Color(0, 0, 0, 120));

    // Menu Panel Background
    gfx_fill_rounded_rect(mx, my, mw, mh, 4, Color(15, 23, 42, 250));
    gfx_draw_rounded_rect(mx, my, mw, mh, 4, theme->accent);

    const char* menu_items[] = {
        ">_ Open Terminal",
        "[T] Task Manager",
        "[P] Paint Studio",
        "[#] New Document",
        "---------------------",
        "[~] Cycle Theme",
        "[!] System Diagnostics"
    };

    int32_t iy = my + 8;
    for (size_t i = 0; i < 7; ++i) {
        if (i == 4) {
            gfx_fill_rect(mx + 6, iy + 6, mw - 12, 1, Color(51, 65, 85, 255));
            iy += 14;
            continue;
        }

        gfx_fill_rounded_rect(mx + 4, iy, mw - 8, 22, 3, Color(28, 37, 65, 160));
        font_draw_string(mx + 10, iy + 3, menu_items[i], COLOR_WHITE);
        iy += 26;
    }
}

static void render_taskbar(int32_t screen_w, int32_t screen_h) {
    const Theme* theme = theme_get_current();
    int32_t tb_y = screen_h - DESKTOP_TASKBAR_HEIGHT;

    // Gradient taskbar background
    gfx_draw_gradient_v(0, tb_y, screen_w, DESKTOP_TASKBAR_HEIGHT,
                        theme->taskbar_top, theme->taskbar_bottom);
    gfx_draw_line(0, tb_y, screen_w, tb_y, theme->taskbar_border);

    // Start Button (Bottom-Left)
    int32_t btn_x = 4;
    int32_t btn_y = tb_y + 4;
    Color btn_bg = g_start_menu_open ? theme->accent : theme->start_btn_bg;

    gfx_fill_rounded_rect(btn_x, btn_y, DESKTOP_START_BTN_W, DESKTOP_START_BTN_H, 4, btn_bg);
    gfx_draw_rounded_rect(btn_x, btn_y, DESKTOP_START_BTN_W, DESKTOP_START_BTN_H, 4, theme->accent);

    int32_t logo_x = btn_x + 8;
    int32_t logo_y = btn_y + 4;
    gfx_fill_rect(logo_x,     logo_y,     6, 6, theme->start_btn_fg);
    gfx_fill_rect(logo_x + 8, logo_y,     6, 6, theme->start_btn_fg);
    gfx_fill_rect(logo_x,     logo_y + 8, 6, 6, theme->start_btn_fg);
    gfx_fill_rect(logo_x + 8, logo_y + 8, 6, 6, theme->start_btn_fg);

    font_draw_string(btn_x + 28, btn_y + 4, "Start", theme->start_btn_fg);

    // Window Tabs on Taskbar
    size_t win_count = wm_get_window_count();
    int32_t tab_x = btn_x + DESKTOP_START_BTN_W + 8;
    int32_t tab_w = 120;
    int32_t tab_h = 24;

    for (size_t i = 0; i < win_count; ++i) {
        Window* win = wm_get_window_by_index(i);
        if (!win) continue;
        if (tab_x + tab_w > screen_w - 200) break;

        bool active = (win->is_focused && win->state != WS_MINIMIZED);
        Color tab_bg = active ? Color(8, 131, 149, 200) : Color(28, 37, 65, 150);
        Color tab_bdr = active ? theme->accent : Color(51, 65, 85, 255);

        gfx_fill_rounded_rect(tab_x, tb_y + 4, tab_w, tab_h, 3, tab_bg);
        gfx_draw_rounded_rect(tab_x, tb_y + 4, tab_w, tab_h, 3, tab_bdr);

        char trunc_title[14];
        size_t t = 0;
        while (win->title[t] && t < 10) {
            trunc_title[t] = win->title[t];
            t++;
        }
        if (win->title[t]) {
            trunc_title[t++] = '.';
            trunc_title[t++] = '.';
        }
        trunc_title[t] = '\0';

        font_draw_string(tab_x + 6, tb_y + 8, trunc_title, active ? COLOR_WHITE : Color(203, 213, 225, 255));

        tab_x += tab_w + 4;
    }

    // System Tray Area (Bottom-Right)
    int32_t tray_w = 160;
    int32_t tray_x = screen_w - tray_w - 4;
    int32_t tray_y = tb_y + 4;

    gfx_fill_rounded_rect(tray_x, tray_y, tray_w, 24, 3, Color(15, 23, 42, 180));
    gfx_draw_rounded_rect(tray_x, tray_y, tray_w, 24, 3, Color(51, 65, 85, 255));

    font_draw_string(tray_x + 8, tray_y + 4, "[x86_64]", theme->accent);

    font_printf(tray_x + 80, tray_y + 4, COLOR_WHITE, COLOR_TRANSPARENT,
                "%02u:%02u:%02u", g_system_time.hours, g_system_time.minutes, g_system_time.seconds);
}

static void render_start_menu(int32_t screen_w, int32_t screen_h) {
    UNUSED(screen_w);
    if (!g_start_menu_open) return;

    const Theme* theme = theme_get_current();

    int32_t sm_x = 4;
    int32_t sm_h = 340;
    int32_t sm_y = screen_h - DESKTOP_TASKBAR_HEIGHT - sm_h - 2;
    int32_t sm_w = DESKTOP_START_MENU_W;

    // Drop Shadow
    gfx_fill_rect(sm_x + 4, sm_y + 4, sm_w, sm_h, Color(0, 0, 0, 120));

    // Menu Panel Background
    gfx_fill_rounded_rect(sm_x, sm_y, sm_w, sm_h, 6, Color(15, 23, 42, 250));
    gfx_draw_rounded_rect(sm_x, sm_y, sm_w, sm_h, 6, theme->accent);

    // Banner Header
    gfx_fill_rounded_rect(sm_x + 2, sm_y + 2, sm_w - 4, 34, 4, theme->start_btn_bg);
    font_draw_string(sm_x + 8, sm_y + 6, "Oxygen Low's Software", COLOR_WHITE);
    font_draw_string(sm_x + 8, sm_y + 20, "x86_64 Desktop Edition", theme->accent);

    // Menu Items
    const char* items[] = {
        ">_ Terminal Shell",
        "[i] System Information",
        "[=] Calculator",
        "[#] Text Editor",
        "[F] File Explorer",
        "[T] Task Manager",
        "[P] Paint Studio",
        "[+] Setup & Recovery",
        "[S] Services",
        "---------------------",
        "[R] Reboot System"
    };

    int32_t item_y = sm_y + 42;
    for (size_t i = 0; i < 11; ++i) {
        if (i == 9) {
            gfx_fill_rect(sm_x + 8, item_y + 5, sm_w - 16, 1, Color(51, 65, 85, 255));
            item_y += 14;
            continue;
        }

        gfx_fill_rounded_rect(sm_x + 6, item_y, sm_w - 12, 23, 3, Color(28, 37, 65, 180));
        font_draw_string(sm_x + 12, item_y + 3, items[i], (i == 7) ? COLOR_OXYGEN_CYAN : COLOR_WHITE);
        item_y += 26;
    }
}

void desktop_update(void) {
    update_clock();
}

void desktop_render(void) {
    MouseState ms = mouse_get_state();

    if (!g_desktop_dirty) {
        bool moved = cursor_update_position(ms.x, ms.y);
        if (moved) {
            fb_present_dirty();
        }
        return;
    }

    int32_t screen_w = static_cast<int32_t>(fb_get_width());
    int32_t screen_h = static_cast<int32_t>(fb_get_height());

    // 1. Wallpaper
    render_wallpaper(screen_w, screen_h);

    // 2. Clickable Desktop Icons
    render_desktop_icons();

    // 3. Windows
    wm_render();

    // 4. Taskbar
    render_taskbar(screen_w, screen_h);

    // 5. Start Menu (if open)
    render_start_menu(screen_w, screen_h);

    // 6. Context Menu (if open)
    render_context_menu();

    // 7. Software Mouse Cursor with Save-Behind Buffer
    cursor_save_behind(ms.x, ms.y);
    cursor_render(ms.x, ms.y);

    // 8. Swap to screen VRAM via dirty region presentation
    fb_mark_dirty_all();
    fb_present_dirty();

    g_desktop_dirty = false;
}

bool desktop_handle_mouse(int32_t x, int32_t y, uint8_t buttons) {
    if (buttons != 0) {
        g_desktop_dirty = true;
    }

    int32_t screen_w = static_cast<int32_t>(fb_get_width());
    int32_t screen_h = static_cast<int32_t>(fb_get_height());
    int32_t tb_y = screen_h - DESKTOP_TASKBAR_HEIGHT;

    // Check Right-Click for Desktop Context Menu
    if (buttons & 2) {
        Window* hit_win = wm_get_window_at(x, y);
        if (!hit_win && y < tb_y) {
            desktop_open_context_menu(x, y);
            return true;
        }
    }

    // Check Context Menu clicks
    if (g_context_menu_open) {
        int32_t mx = g_context_menu_x;
        int32_t my = g_context_menu_y;
        int32_t mw = 190;
        int32_t mh = 200;

        Rect menu_rect(mx, my, mw, mh);
        if (menu_rect.contains(x, y)) {
            if (buttons & 1) {
                int32_t item_idx = (y - (my + 8)) / 26;
                if (item_idx == 0) desktop_launch_app(0); // Terminal
                else if (item_idx == 1) desktop_launch_app(5); // Task Mgr
                else if (item_idx == 2) desktop_launch_app(6); // Paint
                else if (item_idx == 3) desktop_launch_app(3); // Notepad
                else if (item_idx == 5) theme_cycle_next();    // Switch theme
                else if (item_idx == 6) desktop_launch_app(1); // SysInfo

                desktop_close_context_menu();
                return true;
            }
            return true;
        } else if (buttons & 1) {
            desktop_close_context_menu();
        }
    }

    // Check Start Button
    Rect start_btn(4, tb_y + 4, DESKTOP_START_BTN_W, DESKTOP_START_BTN_H);
    if (start_btn.contains(x, y)) {
        if (buttons & 1) {
            desktop_toggle_start_menu();
            return true;
        }
    }

    // Check Start Menu Clicks
    if (g_start_menu_open) {
        int32_t sm_x = 4;
        int32_t sm_h = 340;
        int32_t sm_y = screen_h - DESKTOP_TASKBAR_HEIGHT - sm_h - 2;
        Rect start_menu(sm_x, sm_y, DESKTOP_START_MENU_W, sm_h);

        if (start_menu.contains(x, y)) {
            if (buttons & 1) {
                int32_t rel_y = y - (sm_y + 42);
                int32_t item_idx = (rel_y >= 0) ? (rel_y / 26) : -1;
                if (item_idx >= 0 && item_idx <= 8) {
                    desktop_launch_app(static_cast<uint8_t>(item_idx));
                } else if (item_idx >= 10) {
                    // Reboot
                    outb(0x64, 0xFE);
                }
                g_start_menu_open = false;
                return true;
            }
            return true;
        } else if (buttons & 1) {
            g_start_menu_open = false;
        }
    }

    // Check Taskbar Tabs
    if (y >= tb_y) {
        if (buttons & 1) {
            size_t win_count = wm_get_window_count();
            int32_t tab_x = 98;
            int32_t tab_w = 120;
            int32_t tab_h = 24;

            for (size_t i = 0; i < win_count; ++i) {
                Window* win = wm_get_window_by_index(i);
                if (!win) continue;
                if (tab_x + tab_w > screen_w - 200) break;

                Rect tab_rect(tab_x, tb_y + 4, tab_w, tab_h);
                if (tab_rect.contains(x, y)) {
                    if (win->state == WS_MINIMIZED || !win->is_focused) {
                        wm_restore_window(win);
                    } else {
                        wm_minimize_window(win);
                    }
                    return true;
                }
                tab_x += tab_w + 4;
            }
        }
        return true;
    }

    // Forward to Window Manager first
    bool wm_handled = false;
    if (buttons & 1) {
        wm_handled = wm_handle_mouse_down(x, y, buttons);
    } else {
        wm_handled = wm_handle_mouse_up(x, y, buttons);
    }

    // If Window Manager didn't intercept, check Desktop Icons
    if (!wm_handled && (buttons & 1)) {
        for (size_t i = 0; i < DESKTOP_ICON_COUNT; ++i) {
            const DesktopIcon& icon = g_desktop_icons[i];
            Rect icon_rect(icon.x, icon.y, icon.w, icon.h);
            if (icon_rect.contains(x, y)) {
                g_selected_icon_idx = static_cast<int32_t>(i);
                desktop_launch_app(static_cast<uint8_t>(i));
                return true;
            }
        }
        g_selected_icon_idx = -1;
    }

    return wm_handled;
}

bool desktop_handle_key(uint8_t scancode, char ascii) {
    g_desktop_dirty = true;
    return wm_handle_key_down(scancode, ascii);
}
