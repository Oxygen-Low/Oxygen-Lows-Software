#include "apps/services_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "gui/theme.h"
#include "gui/graphics.h"
#include "arch/x86_64/pit.h"

namespace {

void str_copy_safe(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (src[i] && i < max_len - 1) {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

} // anonymous namespace

ServicesApp::ServicesApp()
    : m_window(nullptr), m_selected_index(0), m_status_color(COLOR_WHITE), m_last_refresh_ms(0) {
    str_copy_safe(m_status_message, "Ready. Select a service to inspect or control.", sizeof(m_status_message));
}

ServicesApp::~ServicesApp() {}

void ServicesApp::on_init(Window* window) {
    m_window = window;
    m_last_refresh_ms = pit_get_uptime_ms();
    m_selected_index = 0;
}

void ServicesApp::set_status(const char* msg, Color col) {
    str_copy_safe(m_status_message, msg, sizeof(m_status_message));
    m_status_color = col;
    if (m_window) m_window->is_dirty = true;
}

void ServicesApp::on_resize(int32_t width, int32_t height) {
    UNUSED(width);
    UNUSED(height);
    if (m_window) m_window->is_dirty = true;
}

void ServicesApp::on_update(void) {
    uint64_t now = pit_get_uptime_ms();
    if (now - m_last_refresh_ms >= 1000) {
        m_last_refresh_ms = now;
        if (m_window) m_window->is_dirty = true;
    }
}

void ServicesApp::on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
    UNUSED(buttons);
    size_t svc_count = service_get_count();

    // 1. Toolbar Buttons (y: 6 to 30)
    if (local_y >= 6 && local_y <= 30) {
        // [Start] (x: 8 to 80)
        if (local_x >= 8 && local_x <= 80) {
            if (m_selected_index >= 0 && static_cast<size_t>(m_selected_index) < svc_count) {
                ServiceInfo info;
                if (service_get_info(static_cast<size_t>(m_selected_index), &info)) {
                    char err[SERVICE_ERR_MAX];
                    if (service_start(info.name, err, sizeof(err))) {
                        set_status("Service started successfully.", Color(34, 197, 94, 255));
                    } else {
                        set_status(err[0] ? err : "Failed to start service.", Color(239, 68, 68, 255));
                    }
                }
            }
            return;
        }

        // [Stop] (x: 88 to 160)
        if (local_x >= 88 && local_x <= 160) {
            if (m_selected_index >= 0 && static_cast<size_t>(m_selected_index) < svc_count) {
                ServiceInfo info;
                if (service_get_info(static_cast<size_t>(m_selected_index), &info)) {
                    char err[SERVICE_ERR_MAX];
                    if (service_stop(info.name, err, sizeof(err))) {
                        set_status("Service stopped successfully.", Color(34, 197, 94, 255));
                    } else {
                        set_status(err[0] ? err : "Cannot stop service.", Color(239, 68, 68, 255));
                    }
                }
            }
            return;
        }

        // [Toggle Startup] (x: 168 to 280)
        if (local_x >= 168 && local_x <= 280) {
            if (m_selected_index >= 0 && static_cast<size_t>(m_selected_index) < svc_count) {
                ServiceInfo info;
                if (service_get_info(static_cast<size_t>(m_selected_index), &info)) {
                    ServiceStartupType new_type = (info.startup_type == SERVICE_STARTUP_AUTOMATIC)
                                                    ? SERVICE_STARTUP_DISABLED
                                                    : SERVICE_STARTUP_AUTOMATIC;
                    char err[SERVICE_ERR_MAX];
                    if (service_set_startup(info.name, new_type, err, sizeof(err))) {
                        if (new_type == SERVICE_STARTUP_AUTOMATIC) {
                            set_status("Startup set to Automatic (starts on boot).", Color(34, 197, 94, 255));
                        } else {
                            set_status("Startup set to Disabled (prevented from starting).", Color(234, 179, 8, 255));
                        }
                    } else {
                        set_status(err[0] ? err : "Cannot change startup setting.", Color(239, 68, 68, 255));
                    }
                }
            }
            return;
        }

        // [Refresh] (x: 288 to 360)
        if (local_x >= 288 && local_x <= 360) {
            set_status("Service table refreshed.", Color(0, 229, 255, 255));
            return;
        }
    }

    // 2. Table Rows (y: 62 downwards, row height: 22)
    int32_t table_y = 62;
    if (local_y >= table_y && local_y < table_y + static_cast<int32_t>(svc_count * 22)) {
        int32_t row = (local_y - table_y) / 22;
        if (row >= 0 && row < static_cast<int32_t>(svc_count)) {
            m_selected_index = row;
            ServiceInfo info;
            if (service_get_info(static_cast<size_t>(m_selected_index), &info)) {
                if (info.is_critical) {
                    set_status("System-critical service: Manages core system. Cannot be cancelled.", Color(234, 179, 8, 255));
                } else {
                    set_status("Service selected. Use toolbar buttons to control.", COLOR_WHITE);
                }
            }
            if (m_window) m_window->is_dirty = true;
            return;
        }
    }
}

void ServicesApp::on_key_down(uint8_t scancode, char ascii) {
    UNUSED(ascii);
    size_t count = service_get_count();
    if (scancode == 0x48) { // Up arrow
        if (m_selected_index > 0) {
            m_selected_index--;
            if (m_window) m_window->is_dirty = true;
        }
    } else if (scancode == 0x50) { // Down arrow
        if (m_selected_index < static_cast<int32_t>(count) - 1) {
            m_selected_index++;
            if (m_window) m_window->is_dirty = true;
        }
    }
}

void ServicesApp::on_paint(const Rect& client_area) {
    const Theme* theme = theme_get_current();
    size_t svc_count = service_get_count();

    // Background
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, theme->panel_bg);

    // 1. Toolbar Header (y: 0 to 36)
    int32_t tb_h = 36;
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, tb_h, Color(20, 28, 45, 255));
    gfx_fill_rect(client_area.x, client_area.y + tb_h - 1, client_area.width, 1, theme->window_border_active);

    // Toolbar Buttons
    // [Start]
    gfx_fill_rounded_rect(client_area.x + 8, client_area.y + 6, 72, 24, 3, Color(22, 101, 52, 255));
    font_draw_string(client_area.x + 24, client_area.y + 10, "Start", COLOR_WHITE);

    // [Stop]
    bool selected_critical = false;
    if (m_selected_index >= 0 && static_cast<size_t>(m_selected_index) < svc_count) {
        ServiceInfo sel_info;
        if (service_get_info(static_cast<size_t>(m_selected_index), &sel_info)) {
            selected_critical = sel_info.is_critical;
        }
    }
    Color stop_bg = selected_critical ? Color(60, 60, 75, 255) : Color(153, 27, 27, 255);
    gfx_fill_rounded_rect(client_area.x + 88, client_area.y + 6, 72, 24, 3, stop_bg);
    font_draw_string(client_area.x + 106, client_area.y + 10, "Stop", COLOR_WHITE);

    // [Toggle Startup]
    Color startup_btn_bg = selected_critical ? Color(50, 55, 70, 255) : Color(14, 116, 144, 255);
    gfx_fill_rounded_rect(client_area.x + 168, client_area.y + 6, 112, 24, 3, startup_btn_bg);
    font_draw_string(client_area.x + 178, client_area.y + 10, "Toggle Startup", COLOR_WHITE);

    // [Refresh]
    gfx_fill_rounded_rect(client_area.x + 288, client_area.y + 6, 72, 24, 3, Color(30, 41, 59, 255));
    font_draw_string(client_area.x + 300, client_area.y + 10, "Refresh", COLOR_WHITE);

    // Right-aligned summary
    font_printf(client_area.x + client_area.width - 160, client_area.y + 10, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                "Services: %u Active", static_cast<unsigned int>(svc_count));

    // 2. Table Column Header (y: 38)
    int32_t col_y = client_area.y + 38;
    gfx_fill_rect(client_area.x + 4, col_y, client_area.width - 8, 22, Color(30, 41, 59, 255));
    gfx_draw_rect(client_area.x + 4, col_y, client_area.width - 8, 22, Color(51, 65, 85, 255));

    font_draw_string(client_area.x + 12, col_y + 3, "Name", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 120, col_y + 3, "Display Name", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 340, col_y + 3, "Status", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 420, col_y + 3, "Startup Type", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 525, col_y + 3, "Critical", Color(0, 229, 255, 255));

    // 3. Service Rows (y: 62)
    int32_t row_y = col_y + 24;
    for (size_t i = 0; i < svc_count; ++i) {
        ServiceInfo info;
        if (!service_get_info(i, &info)) continue;

        bool selected = (static_cast<int32_t>(i) == m_selected_index);
        Color row_bg = selected ? Color(8, 131, 149, 180) : ((i % 2 == 0) ? Color(18, 26, 43, 200) : Color(13, 20, 36, 200));

        gfx_fill_rect(client_area.x + 4, row_y, client_area.width - 8, 20, row_bg);

        // Name
        font_draw_string(client_area.x + 12, row_y + 2, info.name, selected ? COLOR_WHITE : Color(203, 213, 225, 255));

        // Display Name
        font_draw_string(client_area.x + 120, row_y + 2, info.display_name, selected ? COLOR_WHITE : Color(241, 245, 249, 255));

        // Status
        const char* status_str = "Stopped";
        Color status_col = Color(239, 68, 68, 255);
        if (info.status == SERVICE_RUNNING) {
            status_str = "Running";
            status_col = Color(34, 197, 94, 255);
        } else if (info.status == SERVICE_STARTING) {
            status_str = "Starting";
            status_col = Color(234, 179, 8, 255);
        }
        font_draw_string(client_area.x + 340, row_y + 2, status_str, status_col);

        // Startup Type
        const char* startup_str = "Disabled";
        Color startup_col = Color(148, 163, 184, 255);
        if (info.startup_type == SERVICE_STARTUP_AUTOMATIC) {
            startup_str = "Automatic";
            startup_col = Color(0, 229, 255, 255);
        } else if (info.startup_type == SERVICE_STARTUP_MANUAL) {
            startup_str = "Manual";
            startup_col = Color(234, 179, 8, 255);
        }
        font_draw_string(client_area.x + 420, row_y + 2, startup_str, startup_col);

        // Critical flag
        if (info.is_critical) {
            font_draw_string(client_area.x + 525, row_y + 2, "Yes (Core)", Color(234, 179, 8, 255));
        } else {
            font_draw_string(client_area.x + 525, row_y + 2, "No", Color(148, 163, 184, 255));
        }

        row_y += 22;
        if (row_y > client_area.y + client_area.height - 110) break;
    }

    // 4. Details & Status Footer Panel
    int32_t panel_y = client_area.y + client_area.height - 100;
    gfx_fill_rect(client_area.x + 4, panel_y, client_area.width - 8, 96, Color(15, 23, 42, 240));
    gfx_draw_rect(client_area.x + 4, panel_y, client_area.width - 8, 96, Color(51, 65, 85, 255));

    if (m_selected_index >= 0 && static_cast<size_t>(m_selected_index) < svc_count) {
        ServiceInfo info;
        if (service_get_info(static_cast<size_t>(m_selected_index), &info)) {
            font_printf(client_area.x + 12, panel_y + 6, Color(0, 229, 255, 255), COLOR_TRANSPARENT,
                        "Service: %s (%s)", info.display_name, info.name);

            if (info.is_critical) {
                font_draw_string(client_area.x + 12, panel_y + 24,
                                 "[SYSTEM CRITICAL SERVICE: Process is the entire system. Cannot be cancelled or disabled.]",
                                 Color(234, 179, 8, 255));
            } else {
                font_printf(client_area.x + 12, panel_y + 24, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                            "Background Task PID: %u | Autostart: %s",
                            info.task_id, (info.startup_type == SERVICE_STARTUP_AUTOMATIC) ? "Enabled" : "Disabled");
            }

            font_printf(client_area.x + 12, panel_y + 44, Color(226, 232, 240, 255), COLOR_TRANSPARENT,
                        "Description: %s", info.description);
        }
    }

    // Status Message / Alert at bottom of details panel
    gfx_fill_rect(client_area.x + 8, panel_y + 68, client_area.width - 16, 22, Color(10, 16, 30, 255));
    font_draw_string(client_area.x + 16, panel_y + 72, m_status_message, m_status_color);
}
