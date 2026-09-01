#include "gui/desktop.h"
#include "gui/font.h"
#include "gui/cursor.h"
#include "gui/window.h"
#include "arch/x86_64/io.h"
#include "arch/x86_64/pit.h"
#include "mm/pmm.h"
#include "mm/heap.h"
#include "drivers/mouse.h"
#include "drivers/keyboard.h"
#include "drivers/serial.h"

static bool g_start_menu_open = false;
static SystemTime g_system_time = {0, 0, 0};
static uint64_t   g_last_time_update_ms = 0;

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

    // Read RTC CMOS registers
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

    // 12-hour to 24-hour conversion if needed
    if (!(status_b & 0x02) && (hr & 0x80)) {
        hr = ((hr & 0x7F) + 12) % 24;
    }

    // If RTC returns 0s or invalid, interpolate from PIT uptime
    if (hr >= 24 || min >= 60 || sec >= 60) {
        uint64_t total_sec = uptime_ms / 1000;
        sec = static_cast<uint8_t>(total_sec % 60);
        min = static_cast<uint8_t>((total_sec / 60) % 60);
        hr  = static_cast<uint8_t>((total_sec / 3600) % 24);
    }

    g_system_time.hours = hr;
    g_system_time.minutes = min;
    g_system_time.seconds = sec;
}

void desktop_init(void) {
    g_start_menu_open = false;
    g_system_time = {12, 0, 0};
    g_last_time_update_ms = 0;
    update_clock();

    serial_printf("[DESKTOP] Oxygen Low's Software desktop ready\n");
}

void desktop_toggle_start_menu(void) {
    g_start_menu_open = !g_start_menu_open;
}

bool desktop_is_start_menu_open(void) {
    return g_start_menu_open;
}

SystemTime desktop_get_system_time(void) {
    return g_system_time;
}

static void render_wallpaper(int32_t screen_w, int32_t screen_h) {
    // Deep Oxygen Blue radial/linear gradient background
    gfx_draw_gradient_v(0, 0, screen_w, screen_h, Color(11, 19, 43, 255), Color(28, 37, 65, 255));

    // Geometric accent lines / grid for modern desktop aesthetics
    for (int32_t y = 0; y < screen_h; y += 64) {
        gfx_fill_rect(0, y, screen_w, 1, Color(255, 255, 255, 6));
    }
    for (int32_t x = 0; x < screen_w; x += 64) {
        gfx_fill_rect(x, 0, 1, screen_h, Color(255, 255, 255, 6));
    }

    // Large Branded Watermark in Center
    const char* brand_text = "Oxygen Low's Software";
    const char* brand_sub  = "64-bit Desktop Operating System";

    int32_t brand_w = font_measure_string_width(brand_text);
    int32_t sub_w   = font_measure_string_width(brand_sub);

    int32_t center_x = (screen_w - brand_w) / 2;
    int32_t center_y = (screen_h - 60) / 2;

    // Glowing subtle shadow
    font_draw_string(center_x + 2, center_y + 2, brand_text, Color(0, 0, 0, 180));
    font_draw_string(center_x, center_y, brand_text, Color(0, 229, 255, 120)); // Cyan glow

    int32_t sub_x = (screen_w - sub_w) / 2;
    font_draw_string(sub_x, center_y + 24, brand_sub, Color(148, 163, 184, 100));
}

static void render_taskbar(int32_t screen_w, int32_t screen_h) {
    int32_t tb_y = screen_h - DESKTOP_TASKBAR_HEIGHT;

    // Acrylic Translucent Gradient
    gfx_draw_gradient_v(0, tb_y, screen_w, DESKTOP_TASKBAR_HEIGHT,
                        Color(15, 23, 42, 240), Color(28, 37, 65, 250));

    // Top Highlight Border
    gfx_fill_rect(0, tb_y, screen_w, 1, Color(8, 131, 149, 255)); // 0xFF088395

    // 1. Start Button: [O] Oxygen
    Color start_bg = g_start_menu_open ? Color(8, 131, 149, 255) : Color(10, 77, 104, 255);
    gfx_fill_rounded_rect(4, tb_y + 4, DESKTOP_START_BTN_W, DESKTOP_START_BTN_H, 4, start_bg);
    gfx_draw_rounded_rect(4, tb_y + 4, DESKTOP_START_BTN_W, DESKTOP_START_BTN_H, 4, Color(0, 229, 255, 180));

    font_draw_string(10, tb_y + 8, "[O] Oxygen", COLOR_WHITE);

    // 2. Window Task Tabs
    size_t win_count = wm_get_window_count();
    int32_t tab_x = 98;
    int32_t tab_w = 120;
    int32_t tab_h = 24;

    for (size_t i = 0; i < win_count; ++i) {
        Window* win = wm_get_window_by_index(i);
        if (!win) continue;

        if (tab_x + tab_w > screen_w - 200) break; // Leave room for tray

        Color tab_bg = win->is_focused ? Color(8, 131, 149, 255) : Color(30, 41, 59, 200);
        gfx_fill_rounded_rect(tab_x, tb_y + 4, tab_w, tab_h, 3, tab_bg);
        gfx_draw_rounded_rect(tab_x, tb_y + 4, tab_w, tab_h, 3, Color(51, 65, 85, 255));

        // Truncate title to fit in 13 characters
        char short_title[16];
        size_t c = 0;
        while (win->title[c] && c < 12) {
            short_title[c] = win->title[c];
            c++;
        }
        if (win->title[c]) {
            short_title[c++] = '.';
            short_title[c++] = '.';
        }
        short_title[c] = '\0';

        font_draw_string(tab_x + 6, tb_y + 8, short_title, COLOR_WHITE);

        tab_x += tab_w + 4;
    }

    // 3. System Tray (Right aligned)
    // RAM usage badge
    size_t used_ram_mb = pmm_get_used_memory() / (1024 * 1024);
    font_printf(screen_w - 180, tb_y + 8, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                "RAM: %uMB", static_cast<unsigned int>(used_ram_mb));

    // Live Digital Clock (HH:MM:SS)
    font_printf(screen_w - 76, tb_y + 8, Color(0, 229, 255, 255), COLOR_TRANSPARENT,
                "%02u:%02u:%02u", g_system_time.hours, g_system_time.minutes, g_system_time.seconds);
}

static void render_start_menu(int32_t screen_w, int32_t screen_h) {
    UNUSED(screen_w);
    if (!g_start_menu_open) return;

    int32_t sm_x = 4;
    int32_t sm_y = screen_h - DESKTOP_TASKBAR_HEIGHT - DESKTOP_START_MENU_H - 2;
    int32_t sm_w = DESKTOP_START_MENU_W;
    int32_t sm_h = DESKTOP_START_MENU_H;

    // Drop Shadow
    gfx_fill_rect(sm_x + 4, sm_y + 4, sm_w, sm_h, Color(0, 0, 0, 120));

    // Menu Panel Background
    gfx_fill_rounded_rect(sm_x, sm_y, sm_w, sm_h, 6, Color(15, 23, 42, 250));
    gfx_draw_rounded_rect(sm_x, sm_y, sm_w, sm_h, 6, Color(8, 131, 149, 255));

    // Banner Header
    gfx_fill_rounded_rect(sm_x + 2, sm_y + 2, sm_w - 4, 34, 4, Color(10, 77, 104, 255));
    font_draw_string(sm_x + 8, sm_y + 6, "Oxygen Low's Software", COLOR_WHITE);
    font_draw_string(sm_x + 8, sm_y + 20, "x86_64 Edition", Color(0, 229, 255, 255));

    // Menu Items
    const char* items[] = {
        ">_ Terminal Shell",
        "[i] System Information",
        "[=] Calculator",
        "[#] Text Editor",
        "[F] File Explorer",
        "---------------------",
        "[R] Reboot System"
    };

    int32_t item_y = sm_y + 44;
    for (size_t i = 0; i < 7; ++i) {
        if (i == 5) {
            gfx_fill_rect(sm_x + 8, item_y + 8, sm_w - 16, 1, Color(51, 65, 85, 255));
            item_y += 18;
            continue;
        }

        gfx_fill_rounded_rect(sm_x + 6, item_y, sm_w - 12, 24, 3, Color(28, 37, 65, 180));
        font_draw_string(sm_x + 12, item_y + 4, items[i], COLOR_WHITE);
        item_y += 28;
    }
}

void desktop_update(void) {
    update_clock();
}

void desktop_render(void) {
    int32_t screen_w = static_cast<int32_t>(fb_get_width());
    int32_t screen_h = static_cast<int32_t>(fb_get_height());

    // 1. Wallpaper
    render_wallpaper(screen_w, screen_h);

    // 2. Windows
    wm_render();

    // 3. Taskbar
    render_taskbar(screen_w, screen_h);

    // 4. Start Menu (if open)
    render_start_menu(screen_w, screen_h);

    // 5. Software Mouse Cursor
    MouseState ms = mouse_get_state();
    cursor_render(ms.x, ms.y);

    // 6. Flip backbuffer to screen VRAM
    gfx_present();
}

bool desktop_handle_mouse(int32_t x, int32_t y, uint8_t buttons) {
    int32_t screen_w = static_cast<int32_t>(fb_get_width());
    int32_t screen_h = static_cast<int32_t>(fb_get_height());

    int32_t tb_y = screen_h - DESKTOP_TASKBAR_HEIGHT;

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
        int32_t sm_y = screen_h - DESKTOP_TASKBAR_HEIGHT - DESKTOP_START_MENU_H - 2;
        Rect start_menu(sm_x, sm_y, DESKTOP_START_MENU_W, DESKTOP_START_MENU_H);

        if (start_menu.contains(x, y)) {
            if (buttons & 1) {
                int32_t item_idx = (y - (sm_y + 44)) / 28;
                if (item_idx == 0) {
                    // Focus or restore Terminal
                    Window* w = wm_get_bottom_window();
                    while (w) {
                        if (w->title[0] == 'T') { wm_restore_window(w); break; }
                        w = w->next;
                    }
                } else if (item_idx == 1) {
                    // SysInfo
                    Window* w = wm_get_bottom_window();
                    while (w) {
                        if (w->title[0] == 'S') { wm_restore_window(w); break; }
                        w = w->next;
                    }
                } else if (item_idx == 2) {
                    // Calculator
                    Window* w = wm_get_bottom_window();
                    while (w) {
                        if (w->title[0] == 'C') { wm_restore_window(w); break; }
                        w = w->next;
                    }
                } else if (item_idx == 3) {
                    // Notepad
                    Window* w = wm_get_bottom_window();
                    while (w) {
                        if (w->title[0] == 'N') { wm_restore_window(w); break; }
                        w = w->next;
                    }
                } else if (item_idx == 4) {
                    // Explorer
                    Window* w = wm_get_bottom_window();
                    while (w) {
                        if (w->title[0] == 'F') { wm_restore_window(w); break; }
                        w = w->next;
                    }
                } else if (item_idx >= 5) {
                    // Reboot
                    outb(0x64, 0xFE);
                }
                g_start_menu_open = false;
                return true;
            }
            return true;
        } else if (buttons & 1) {
            // Click outside start menu closes it
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

    // Forward to Window Manager
    if (buttons & 1) {
        return wm_handle_mouse_down(x, y, buttons);
    } else {
        return wm_handle_mouse_up(x, y, buttons);
    }
}

bool desktop_handle_key(uint8_t scancode, char ascii) {
    return wm_handle_key_down(scancode, ascii);
}
