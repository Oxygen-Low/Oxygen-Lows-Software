#include "apps/taskmgr_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "gui/theme.h"
#include "mm/pmm.h"
#include "mm/heap.h"
#include "arch/x86_64/pit.h"

namespace {

void str_copy_buf(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (src[i] && i < max_len - 1) {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

} // anonymous namespace

TaskMgrApp::TaskMgrApp()
    : m_window(nullptr), m_current_tab(0), m_selected_index(-1),
      m_service_selected_index(0), m_service_status_color(COLOR_WHITE),
      m_last_refresh_ms(0), m_history_idx(0) {
    for (size_t i = 0; i < TASKMGR_MAX_HISTORY; ++i) {
        m_cpu_history[i] = 10;
    }
    str_copy_buf(m_service_status_msg, "Select a service to inspect or control.", sizeof(m_service_status_msg));
}

TaskMgrApp::~TaskMgrApp() {}

void TaskMgrApp::on_init(Window* window) {
    m_window = window;
    m_last_refresh_ms = pit_get_uptime_ms();
}

void TaskMgrApp::on_resize(int32_t width, int32_t height) {
    UNUSED(width);
    UNUSED(height);
    if (m_window) m_window->is_dirty = true;
}

void TaskMgrApp::on_update(void) {
    uint64_t now = pit_get_uptime_ms();
    if (now - m_last_refresh_ms >= 1000) {
        m_last_refresh_ms = now;

        // Calculate aggregate CPU%
        size_t count = sched_get_task_count();
        uint32_t total_cpu = 0;
        for (size_t i = 0; i < count; ++i) {
            TaskInfo info;
            if (sched_get_task_info(i, &info)) {
                total_cpu += info.cpu_usage_pct;
            }
        }
        if (total_cpu > 100) total_cpu = 100;
        if (total_cpu == 0) total_cpu = 12; // Base system idle activity

        m_cpu_history[m_history_idx] = static_cast<uint8_t>(total_cpu);
        m_history_idx = (m_history_idx + 1) % TASKMGR_MAX_HISTORY;

        if (m_window) m_window->is_dirty = true;
    }
}

void TaskMgrApp::on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
    UNUSED(buttons);

    // Tab buttons (y: 4 to 28)
    if (local_y >= 4 && local_y <= 28) {
        if (local_x >= 8 && local_x <= 110) {
            m_current_tab = 0; // Processes
            if (m_window) m_window->is_dirty = true;
            return;
        } else if (local_x >= 116 && local_x <= 230) {
            m_current_tab = 1; // Performance
            if (m_window) m_window->is_dirty = true;
            return;
        } else if (local_x >= 236 && local_x <= 336) {
            m_current_tab = 2; // Services
            if (m_window) m_window->is_dirty = true;
            return;
        }
    }

    // 1. Processes Tab Interactions
    if (m_current_tab == 0) {
        // Table row selection (y: 60 downwards, each row 22px)
        int32_t table_y = 60;
        size_t task_count = sched_get_task_count();
        if (local_y >= table_y && local_y < table_y + static_cast<int32_t>(task_count * 22)) {
            int32_t clicked_row = (local_y - table_y) / 22;
            if (clicked_row >= 0 && clicked_row < static_cast<int32_t>(task_count)) {
                m_selected_index = clicked_row;
                if (m_window) m_window->is_dirty = true;
                return;
            }
        }

        // Action Buttons at bottom
        int32_t btn_y = m_window ? (m_window->client_bounds.height - 30) : 320;
        if (local_y >= btn_y && local_y <= btn_y + 24) {
            // [End Task] Button
            if (local_x >= 8 && local_x <= 100) {
                if (m_selected_index >= 0) {
                    TaskInfo info;
                    if (sched_get_task_info(static_cast<size_t>(m_selected_index), &info)) {
                        sched_kill_task(info.id);
                        m_selected_index = -1;
                        if (m_window) m_window->is_dirty = true;
                    }
                }
                return;
            }
            // [New Task] Button
            else if (local_x >= 108 && local_x <= 200) {
                sched_create_task("Worker Thread", [](void* a){
                    UNUSED(a);
                    for (int i = 0; i < 50; ++i) {
                        pit_sleep_ms(500);
                    }
                }, nullptr, 4);
                if (m_window) m_window->is_dirty = true;
                return;
            }
        }
    }
    // 2. Services Tab Interactions
    else if (m_current_tab == 2) {
        size_t svc_count = service_get_count();
        int32_t table_y = 60;

        // Service Table Row Selection
        if (local_y >= table_y && local_y < table_y + static_cast<int32_t>(svc_count * 22)) {
            int32_t row = (local_y - table_y) / 22;
            if (row >= 0 && row < static_cast<int32_t>(svc_count)) {
                m_service_selected_index = row;
                ServiceInfo info;
                if (service_get_info(static_cast<size_t>(m_service_selected_index), &info)) {
                    if (info.is_critical) {
                        str_copy_buf(m_service_status_msg, "System Critical Service: Process is the entire system. Cannot be stopped.", sizeof(m_service_status_msg));
                        m_service_status_color = Color(234, 179, 8, 255);
                    } else {
                        str_copy_buf(m_service_status_msg, "Service selected. Ready.", sizeof(m_service_status_msg));
                        m_service_status_color = COLOR_WHITE;
                    }
                }
                if (m_window) m_window->is_dirty = true;
                return;
            }
        }

        // Action Buttons at bottom
        int32_t btn_y = m_window ? (m_window->client_bounds.height - 30) : 320;
        if (local_y >= btn_y && local_y <= btn_y + 24) {
            // [Start Service] Button (x: 8 to 110)
            if (local_x >= 8 && local_x <= 110) {
                if (m_service_selected_index >= 0 && static_cast<size_t>(m_service_selected_index) < svc_count) {
                    ServiceInfo info;
                    if (service_get_info(static_cast<size_t>(m_service_selected_index), &info)) {
                        char err[SERVICE_ERR_MAX];
                        if (service_start(info.name, err, sizeof(err))) {
                            str_copy_buf(m_service_status_msg, "Service started successfully.", sizeof(m_service_status_msg));
                            m_service_status_color = Color(34, 197, 94, 255);
                        } else {
                            str_copy_buf(m_service_status_msg, err[0] ? err : "Failed to start service.", sizeof(m_service_status_msg));
                            m_service_status_color = Color(239, 68, 68, 255);
                        }
                        if (m_window) m_window->is_dirty = true;
                    }
                }
                return;
            }
            // [Stop Service] Button (x: 118 to 220)
            else if (local_x >= 118 && local_x <= 220) {
                if (m_service_selected_index >= 0 && static_cast<size_t>(m_service_selected_index) < svc_count) {
                    ServiceInfo info;
                    if (service_get_info(static_cast<size_t>(m_service_selected_index), &info)) {
                        char err[SERVICE_ERR_MAX];
                        if (service_stop(info.name, err, sizeof(err))) {
                            str_copy_buf(m_service_status_msg, "Service stopped successfully.", sizeof(m_service_status_msg));
                            m_service_status_color = Color(34, 197, 94, 255);
                        } else {
                            str_copy_buf(m_service_status_msg, err[0] ? err : "Cannot stop service.", sizeof(m_service_status_msg));
                            m_service_status_color = Color(239, 68, 68, 255);
                        }
                        if (m_window) m_window->is_dirty = true;
                    }
                }
                return;
            }
            // [Toggle Startup] Button (x: 228 to 350)
            else if (local_x >= 228 && local_x <= 350) {
                if (m_service_selected_index >= 0 && static_cast<size_t>(m_service_selected_index) < svc_count) {
                    ServiceInfo info;
                    if (service_get_info(static_cast<size_t>(m_service_selected_index), &info)) {
                        ServiceStartupType new_type = (info.startup_type == SERVICE_STARTUP_AUTOMATIC)
                                                        ? SERVICE_STARTUP_DISABLED
                                                        : SERVICE_STARTUP_AUTOMATIC;
                        char err[SERVICE_ERR_MAX];
                        if (service_set_startup(info.name, new_type, err, sizeof(err))) {
                            str_copy_buf(m_service_status_msg,
                                         (new_type == SERVICE_STARTUP_AUTOMATIC) ? "Startup: Automatic." : "Startup: Disabled.",
                                         sizeof(m_service_status_msg));
                            m_service_status_color = Color(34, 197, 94, 255);
                        } else {
                            str_copy_buf(m_service_status_msg, err[0] ? err : "Cannot change startup setting.", sizeof(m_service_status_msg));
                            m_service_status_color = Color(239, 68, 68, 255);
                        }
                        if (m_window) m_window->is_dirty = true;
                    }
                }
                return;
            }
        }
    }
}

void TaskMgrApp::on_key_down(uint8_t scancode, char ascii) {
    UNUSED(ascii);
    if (m_current_tab == 0) {
        size_t count = sched_get_task_count();
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
        } else if (scancode == 0x53) { // Delete key
            if (m_selected_index >= 0) {
                TaskInfo info;
                if (sched_get_task_info(static_cast<size_t>(m_selected_index), &info)) {
                    sched_kill_task(info.id);
                    m_selected_index = -1;
                    if (m_window) m_window->is_dirty = true;
                }
            }
        }
    } else if (m_current_tab == 2) {
        size_t count = service_get_count();
        if (scancode == 0x48) { // Up arrow
            if (m_service_selected_index > 0) {
                m_service_selected_index--;
                if (m_window) m_window->is_dirty = true;
            }
        } else if (scancode == 0x50) { // Down arrow
            if (m_service_selected_index < static_cast<int32_t>(count) - 1) {
                m_service_selected_index++;
                if (m_window) m_window->is_dirty = true;
            }
        }
    }
}

void TaskMgrApp::on_paint(const Rect& client_area) {
    const Theme* theme = theme_get_current();

    // Background
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, theme->panel_bg);

    // 1. Navigation Tabs Header
    int32_t header_h = 32;
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, header_h, Color(20, 28, 45, 255));
    gfx_fill_rect(client_area.x, client_area.y + header_h - 1, client_area.width, 1, theme->window_border_active);

    // Tab 1: Processes
    Color t1_bg = (m_current_tab == 0) ? theme->accent : Color(30, 41, 59, 200);
    gfx_fill_rounded_rect(client_area.x + 8, client_area.y + 4, 100, 24, 3, t1_bg);
    font_draw_string(client_area.x + 18, client_area.y + 8, "Processes", (m_current_tab == 0) ? COLOR_BLACK : COLOR_WHITE);

    // Tab 2: Performance
    Color t2_bg = (m_current_tab == 1) ? theme->accent : Color(30, 41, 59, 200);
    gfx_fill_rounded_rect(client_area.x + 114, client_area.y + 4, 110, 24, 3, t2_bg);
    font_draw_string(client_area.x + 122, client_area.y + 8, "Performance", (m_current_tab == 1) ? COLOR_BLACK : COLOR_WHITE);

    // Tab 3: Services
    Color t3_bg = (m_current_tab == 2) ? theme->accent : Color(30, 41, 59, 200);
    gfx_fill_rounded_rect(client_area.x + 230, client_area.y + 4, 100, 24, 3, t3_bg);
    font_draw_string(client_area.x + 245, client_area.y + 8, "Services", (m_current_tab == 2) ? COLOR_BLACK : COLOR_WHITE);

    // System summary stats (Right aligned in header)
    size_t ram_used = pmm_get_used_memory() / (1024 * 1024);
    size_t ram_total = pmm_get_total_memory() / (1024 * 1024);
    font_printf(client_area.x + client_area.width - 190, client_area.y + 8, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                "RAM: %uMB / %uMB", static_cast<unsigned int>(ram_used), static_cast<unsigned int>(ram_total));

    if (m_current_tab == 0) {
        draw_processes_view(client_area);
    } else if (m_current_tab == 1) {
        draw_performance_view(client_area);
    } else {
        draw_services_view(client_area);
    }
}

void TaskMgrApp::draw_processes_view(const Rect& client_area) {
    const Theme* theme = theme_get_current();

    // Table Header Row (y: 36)
    int32_t th_y = client_area.y + 36;
    gfx_fill_rect(client_area.x + 4, th_y, client_area.width - 8, 22, Color(30, 41, 59, 255));
    gfx_draw_rect(client_area.x + 4, th_y, client_area.width - 8, 22, Color(51, 65, 85, 255));

    font_draw_string(client_area.x + 12, th_y + 3, "PID", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 55, th_y + 3, "Process Name", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 230, th_y + 3, "State", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 310, th_y + 3, "Prio", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 360, th_y + 3, "CPU%", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 420, th_y + 3, "Memory", Color(0, 229, 255, 255));

    // Process Rows
    int32_t row_y = th_y + 24;
    size_t count = sched_get_task_count();

    for (size_t i = 0; i < count; ++i) {
        TaskInfo info;
        if (!sched_get_task_info(i, &info)) continue;

        bool selected = (static_cast<int32_t>(i) == m_selected_index);
        Color row_bg = selected ? Color(8, 131, 149, 180) : ((i % 2 == 0) ? Color(18, 26, 43, 200) : Color(13, 20, 36, 200));

        gfx_fill_rect(client_area.x + 4, row_y, client_area.width - 8, 20, row_bg);

        // PID
        font_printf(client_area.x + 12, row_y + 2, COLOR_WHITE, COLOR_TRANSPARENT, "%2u", info.id);

        // Name
        font_draw_string(client_area.x + 55, row_y + 2, info.name, selected ? COLOR_WHITE : Color(241, 245, 249, 255));

        // State string
        const char* state_str = "READY";
        Color state_col = Color(34, 197, 94, 255);
        if (info.state == TASK_RUNNING) {
            state_str = "RUNNING";
            state_col = Color(0, 229, 255, 255);
        } else if (info.state == TASK_SLEEPING) {
            state_str = "SLEEP";
            state_col = Color(234, 179, 8, 255);
        } else if (info.state == TASK_TERMINATED) {
            state_str = "DEAD";
            state_col = Color(239, 68, 68, 255);
        }
        font_draw_string(client_area.x + 230, row_y + 2, state_str, state_col);

        // Prio
        font_printf(client_area.x + 315, row_y + 2, Color(148, 163, 184, 255), COLOR_TRANSPARENT, "%u", info.priority);

        // CPU %
        font_printf(client_area.x + 365, row_y + 2, Color(241, 245, 249, 255), COLOR_TRANSPARENT, "%u%%", info.cpu_usage_pct);

        // Stack/Memory
        font_printf(client_area.x + 420, row_y + 2, Color(148, 163, 184, 255), COLOR_TRANSPARENT, "%u KB", static_cast<unsigned int>(info.stack_size / 1024));

        row_y += 22;
        if (row_y > client_area.y + client_area.height - 40) break;
    }

    // Action Buttons Toolbar at Bottom
    int32_t btn_y = client_area.y + client_area.height - 28;
    gfx_fill_rect(client_area.x, btn_y - 2, client_area.width, 30, Color(20, 28, 45, 255));

    // [End Task] Button
    Color end_bg = (m_selected_index >= 0) ? theme->close_btn : Color(60, 60, 75, 255);
    gfx_fill_rounded_rect(client_area.x + 8, btn_y, 90, 22, 3, end_bg);
    font_draw_string(client_area.x + 18, btn_y + 3, "End Task", COLOR_WHITE);

    // [New Task] Button
    gfx_fill_rounded_rect(client_area.x + 106, btn_y, 90, 22, 3, Color(10, 77, 104, 255));
    font_draw_string(client_area.x + 116, btn_y + 3, "New Task", COLOR_WHITE);

    // Tasks total summary
    font_printf(client_area.x + client_area.width - 150, btn_y + 3, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                "Total Tasks: %u", static_cast<unsigned int>(count));
}

void TaskMgrApp::draw_performance_view(const Rect& client_area) {
    const Theme* theme = theme_get_current();

    // 1. CPU Usage Meter Box
    int32_t box1_x = client_area.x + 12;
    int32_t box1_y = client_area.y + 44;
    int32_t box1_w = client_area.width - 24;
    int32_t box1_h = 100;

    gfx_fill_rounded_rect(box1_x, box1_y, box1_w, box1_h, 4, Color(15, 23, 42, 255));
    gfx_draw_rounded_rect(box1_x, box1_y, box1_w, box1_h, 4, Color(51, 65, 85, 255));

    uint8_t cur_cpu = m_cpu_history[(m_history_idx + TASKMGR_MAX_HISTORY - 1) % TASKMGR_MAX_HISTORY];
    font_printf(box1_x + 12, box1_y + 8, theme->accent, COLOR_TRANSPARENT, "CPU Utilization: %u%%", cur_cpu);

    // CPU History Bar Graph / Sparkline
    int32_t graph_x = box1_x + 12;
    int32_t graph_y = box1_y + 30;
    int32_t graph_w = box1_w - 24;
    int32_t graph_h = 58;

    gfx_fill_rect(graph_x, graph_y, graph_w, graph_h, Color(10, 15, 26, 255));
    gfx_draw_rect(graph_x, graph_y, graph_w, graph_h, Color(30, 41, 59, 255));

    // Grid lines
    for (int y = graph_y + 14; y < graph_y + graph_h; y += 14) {
        gfx_fill_rect(graph_x, y, graph_w, 1, Color(255, 255, 255, 12));
    }

    // Draw bars for each history point
    int32_t col_w = graph_w / TASKMGR_MAX_HISTORY;
    for (size_t i = 0; i < TASKMGR_MAX_HISTORY; ++i) {
        size_t h_idx = (m_history_idx + i) % TASKMGR_MAX_HISTORY;
        uint8_t val = m_cpu_history[h_idx];
        int32_t bar_h = (val * (graph_h - 4)) / 100;
        int32_t bx = graph_x + (i * col_w);
        int32_t by = graph_y + graph_h - bar_h - 2;
        gfx_fill_rect(bx + 1, by, col_w - 2, bar_h, theme->accent);
    }

    // 2. Physical Memory Meter Box
    int32_t box2_y = box1_y + box1_h + 12;
    int32_t box2_h = 70;
    gfx_fill_rounded_rect(box1_x, box2_y, box1_w, box2_h, 4, Color(15, 23, 42, 255));
    gfx_draw_rounded_rect(box1_x, box2_y, box1_w, box2_h, 4, Color(51, 65, 85, 255));

    size_t ram_used = pmm_get_used_memory() / (1024 * 1024);
    size_t ram_total = pmm_get_total_memory() / (1024 * 1024);
    uint32_t ram_pct = (ram_total > 0) ? static_cast<uint32_t>((ram_used * 100) / ram_total) : 0;

    font_printf(box1_x + 12, box2_y + 8, Color(34, 197, 94, 255), COLOR_TRANSPARENT,
                "Physical Memory: %u MB / %u MB (%u%%)",
                static_cast<unsigned int>(ram_used), static_cast<unsigned int>(ram_total), ram_pct);

    // Memory Bar
    int32_t bar_x = box1_x + 12;
    int32_t bar_y = box2_y + 34;
    int32_t bar_w = box1_w - 24;
    int32_t bar_h = 22;

    gfx_fill_rect(bar_x, bar_y, bar_w, bar_h, Color(10, 15, 26, 255));
    gfx_draw_rect(bar_x, bar_y, bar_w, bar_h, Color(51, 65, 85, 255));

    int32_t filled_w = (ram_pct * bar_w) / 100;
    if (filled_w > 0) {
        gfx_draw_gradient_h(bar_x + 1, bar_y + 1, filled_w, bar_h - 2, Color(16, 185, 129, 255), Color(5, 150, 105, 255));
    }

    // 3. System Kernel Metrics Box
    int32_t box3_y = box2_y + box2_h + 12;
    int32_t box3_h = 70;
    gfx_fill_rounded_rect(box1_x, box3_y, box1_w, box3_h, 4, Color(15, 23, 42, 255));
    gfx_draw_rounded_rect(box1_x, box3_y, box1_w, box3_h, 4, Color(51, 65, 85, 255));

    uint64_t uptime_sec = pit_get_uptime_ms() / 1000;
    size_t heap_used = heap_get_used_bytes() / 1024;
    size_t heap_total = heap_get_total_bytes() / 1024;

    font_draw_string(box1_x + 12, box3_y + 8, "Kernel Diagnostics & Memory Pool:", Color(240, 171, 252, 255));
    font_printf(box1_x + 12, box3_y + 28, COLOR_WHITE, COLOR_TRANSPARENT,
                "Heap Used: %u KB / %u KB | Free Frames: %u",
                static_cast<unsigned int>(heap_used), static_cast<unsigned int>(heap_total),
                static_cast<unsigned int>(pmm_get_free_frames()));
    font_printf(box1_x + 12, box3_y + 46, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                "Kernel Uptime: %u seconds | Scheduler: Preemptive 1000Hz Round-Robin",
                static_cast<unsigned int>(uptime_sec));
}

void TaskMgrApp::draw_services_view(const Rect& client_area) {
    const Theme* theme = theme_get_current();
    size_t svc_count = service_get_count();

    // Table Header Row (y: 36)
    int32_t th_y = client_area.y + 36;
    gfx_fill_rect(client_area.x + 4, th_y, client_area.width - 8, 22, Color(30, 41, 59, 255));
    gfx_draw_rect(client_area.x + 4, th_y, client_area.width - 8, 22, Color(51, 65, 85, 255));

    font_draw_string(client_area.x + 12, th_y + 3, "Name", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 120, th_y + 3, "Display Name", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 290, th_y + 3, "Status", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 360, th_y + 3, "Startup", Color(0, 229, 255, 255));
    font_draw_string(client_area.x + 435, th_y + 3, "Critical", Color(0, 229, 255, 255));

    // Service Rows
    int32_t row_y = th_y + 24;
    for (size_t i = 0; i < svc_count; ++i) {
        ServiceInfo info;
        if (!service_get_info(i, &info)) continue;

        bool selected = (static_cast<int32_t>(i) == m_service_selected_index);
        Color row_bg = selected ? Color(8, 131, 149, 180) : ((i % 2 == 0) ? Color(18, 26, 43, 200) : Color(13, 20, 36, 200));

        gfx_fill_rect(client_area.x + 4, row_y, client_area.width - 8, 20, row_bg);

        // Name
        font_draw_string(client_area.x + 12, row_y + 2, info.name, selected ? COLOR_WHITE : Color(203, 213, 225, 255));

        // Display Name
        font_draw_string(client_area.x + 120, row_y + 2, info.display_name, selected ? COLOR_WHITE : Color(241, 245, 249, 255));

        // Status
        const char* status_str = (info.status == SERVICE_RUNNING) ? "Running" : "Stopped";
        Color status_col = (info.status == SERVICE_RUNNING) ? Color(34, 197, 94, 255) : Color(239, 68, 68, 255);
        font_draw_string(client_area.x + 290, row_y + 2, status_str, status_col);

        // Startup
        const char* startup_str = (info.startup_type == SERVICE_STARTUP_AUTOMATIC) ? "Auto" : "Disabled";
        Color startup_col = (info.startup_type == SERVICE_STARTUP_AUTOMATIC) ? Color(0, 229, 255, 255) : Color(148, 163, 184, 255);
        font_draw_string(client_area.x + 360, row_y + 2, startup_str, startup_col);

        // Critical
        if (info.is_critical) {
            font_draw_string(client_area.x + 435, row_y + 2, "Yes (Core)", Color(234, 179, 8, 255));
        } else {
            font_draw_string(client_area.x + 435, row_y + 2, "No", Color(148, 163, 184, 255));
        }

        row_y += 22;
        if (row_y > client_area.y + client_area.height - 70) break;
    }

    // Feedback message above buttons
    int32_t msg_y = client_area.y + client_area.height - 52;
    gfx_fill_rect(client_area.x + 4, msg_y, client_area.width - 8, 20, Color(15, 23, 42, 240));
    font_draw_string(client_area.x + 10, msg_y + 2, m_service_status_msg, m_service_status_color);

    // Action Buttons Toolbar at Bottom
    int32_t btn_y = client_area.y + client_area.height - 28;
    gfx_fill_rect(client_area.x, btn_y - 2, client_area.width, 30, Color(20, 28, 45, 255));

    // [Start Service] Button
    gfx_fill_rounded_rect(client_area.x + 8, btn_y, 96, 22, 3, Color(22, 101, 52, 255));
    font_draw_string(client_area.x + 14, btn_y + 3, "Start Service", COLOR_WHITE);

    // [Stop Service] Button
    bool selected_critical = false;
    if (m_service_selected_index >= 0 && static_cast<size_t>(m_service_selected_index) < svc_count) {
        ServiceInfo sel_info;
        if (service_get_info(static_cast<size_t>(m_service_selected_index), &sel_info)) {
            selected_critical = sel_info.is_critical;
        }
    }
    Color stop_bg = selected_critical ? Color(60, 60, 75, 255) : theme->close_btn;
    gfx_fill_rounded_rect(client_area.x + 112, btn_y, 96, 22, 3, stop_bg);
    font_draw_string(client_area.x + 120, btn_y + 3, "Stop Service", COLOR_WHITE);

    // [Toggle Startup] Button
    Color toggle_bg = selected_critical ? Color(50, 55, 70, 255) : Color(14, 116, 144, 255);
    gfx_fill_rounded_rect(client_area.x + 216, btn_y, 110, 22, 3, toggle_bg);
    font_draw_string(client_area.x + 222, btn_y + 3, "Toggle Startup", COLOR_WHITE);

    // Total Services Count
    font_printf(client_area.x + client_area.width - 150, btn_y + 3, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                "Total Services: %u", static_cast<unsigned int>(svc_count));
}
