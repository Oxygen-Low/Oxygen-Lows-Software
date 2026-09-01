#include "apps/explorer_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "drivers/keyboard.h"

static const Color COLOR_EXP_BG       = Color(15, 23, 42, 255);
static const Color COLOR_EXP_BAR      = Color(28, 37, 65, 255);
static const Color COLOR_EXP_SIDEBAR  = Color(20, 29, 52, 255);
static const Color COLOR_EXP_PREVIEW  = Color(11, 19, 43, 255);
static const Color COLOR_EXP_DIR      = Color(255, 204, 0, 255); // Yellow
static const Color COLOR_EXP_FILE     = Color(0, 229, 255, 255); // Cyan
static const Color COLOR_EXP_SELECTED = Color(8, 131, 149, 255);

ExplorerApp::ExplorerApp()
    : m_window(nullptr), m_item_count(0), m_selected_index(-1),
      m_preview_is_valid(false) {
    m_current_path[0] = '/';
    m_current_path[1] = '\0';
    m_preview_text[0] = '\0';
}

ExplorerApp::~ExplorerApp() {}

void ExplorerApp::on_init(Window* window) {
    m_window = window;
    navigate_to("/");
}

void ExplorerApp::refresh_list(void) {
    m_item_count = 0;
    m_selected_index = -1;
    m_preview_is_valid = false;
    m_preview_text[0] = '\0';

    VFSNode* dir = vfs_resolve_path(m_current_path);
    if (!dir) {
        // Reset to root if invalid
        m_current_path[0] = '/';
        m_current_path[1] = '\0';
        dir = vfs_get_root();
    }

    if (!dir) return;

    VFSDirectoryEntry entry;
    size_t idx = 0;
    while (vfs_readdir(dir, idx, &entry) && m_item_count < EXPLORER_MAX_ITEMS) {
        size_t n = 0;
        while (entry.name[n] && n < VFS_MAX_NAME_LEN - 1) {
            m_items[m_item_count].name[n] = entry.name[n];
            n++;
        }
        m_items[m_item_count].name[n] = '\0';
        m_items[m_item_count].type = entry.type;
        m_items[m_item_count].size = entry.size;
        m_item_count++;
        idx++;
    }

    // Auto-select first file if available
    if (m_item_count > 0) {
        select_item(0);
    }
}

void ExplorerApp::navigate_to(const char* path) {
    if (!path) return;
    size_t i = 0;
    while (path[i] && i < EXPLORER_MAX_PATH - 1) {
        m_current_path[i] = path[i];
        i++;
    }
    m_current_path[i] = '\0';
    refresh_list();
}

void ExplorerApp::navigate_up(void) {
    size_t len = 0;
    while (m_current_path[len]) len++;
    if (len <= 1) return; // At root

    if (m_current_path[len - 1] == '/') len--;
    while (len > 0 && m_current_path[len - 1] != '/') len--;

    if (len == 0) len = 1; // Root '/'
    m_current_path[len] = '\0';
    refresh_list();
}

void ExplorerApp::load_preview(const char* filename) {
    m_preview_is_valid = false;
    m_preview_text[0] = '\0';

    char full_path[EXPLORER_MAX_PATH];
    size_t p = 0;
    while (m_current_path[p] && p < EXPLORER_MAX_PATH - 1) {
        full_path[p] = m_current_path[p];
        p++;
    }
    if (p > 0 && full_path[p - 1] != '/' && p < EXPLORER_MAX_PATH - 1) {
        full_path[p++] = '/';
    }
    size_t f = 0;
    while (filename[f] && p < EXPLORER_MAX_PATH - 1) {
        full_path[p++] = filename[f++];
    }
    full_path[p] = '\0';

    VFSNode* node = vfs_resolve_path(full_path);
    if (node && node->type == VFS_TYPE_FILE) {
        size_t bytes_read = vfs_read(node, 0, EXPLORER_PREVIEW_BUF - 1, reinterpret_cast<uint8_t*>(m_preview_text));
        m_preview_text[bytes_read] = '\0';
        m_preview_is_valid = true;
    }
}

void ExplorerApp::select_item(int32_t index) {
    if (index < 0 || index >= static_cast<int32_t>(m_item_count)) return;
    m_selected_index = index;

    if (m_items[index].type == VFS_TYPE_FILE) {
        load_preview(m_items[index].name);
    } else {
        m_preview_is_valid = false;
        m_preview_text[0] = '\0';
    }
}

void ExplorerApp::open_selected_item(void) {
    if (m_selected_index < 0 || m_selected_index >= static_cast<int32_t>(m_item_count)) return;

    if (m_items[m_selected_index].type == VFS_TYPE_DIRECTORY) {
        // Enter directory
        size_t p = 0;
        while (m_current_path[p]) p++;
        if (p > 0 && m_current_path[p - 1] != '/' && p < EXPLORER_MAX_PATH - 1) {
            m_current_path[p++] = '/';
        }
        size_t f = 0;
        while (m_items[m_selected_index].name[f] && p < EXPLORER_MAX_PATH - 1) {
            m_current_path[p++] = m_items[m_selected_index].name[f++];
        }
        m_current_path[p] = '\0';
        refresh_list();
    }
}

void ExplorerApp::on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
    UNUSED(buttons);
    // 1. Top Bar: [Up] button (x: 8 to 56, y: 6 to 26)
    if (local_y >= 6 && local_y <= 26) {
        if (local_x >= 8 && local_x <= 56) {
            navigate_up();
            return;
        } else if (local_x >= 62 && local_x <= 130) {
            refresh_list();
            return;
        }
    }

    // 2. Sidebar Quick Links (x: 0 to 120, y: 36 to 240)
    if (local_x >= 6 && local_x <= 114 && local_y >= 36 && local_y <= 240) {
        int32_t item_idx = (local_y - 40) / 24;
        if (item_idx == 0) navigate_to("/");
        else if (item_idx == 1) navigate_to("/system");
        else if (item_idx == 2) navigate_to("/docs");
        else if (item_idx == 3) navigate_to("/apps");
        return;
    }

    // 3. File List Items (x: 124 to end, y: 36 to 240)
    if (local_x >= 124 && local_y >= 36 && local_y <= 240) {
        int32_t item_idx = (local_y - 38) / 20;
        if (item_idx >= 0 && item_idx < static_cast<int32_t>(m_item_count)) {
            if (m_selected_index == item_idx) {
                // Double click / second click opens directory
                open_selected_item();
            } else {
                select_item(item_idx);
            }
        }
    }
}

void ExplorerApp::on_key_down(uint8_t scancode, char ascii) {
    if (scancode == KEY_SCAN_UP) {
        if (m_selected_index > 0) select_item(m_selected_index - 1);
    } else if (scancode == KEY_SCAN_DOWN) {
        if (m_selected_index < static_cast<int32_t>(m_item_count) - 1) select_item(m_selected_index + 1);
    } else if (ascii == '\n' || ascii == '\r') {
        open_selected_item();
    } else if (ascii == '\b') {
        navigate_up();
    }
}

void ExplorerApp::on_paint(const Rect& client_area) {
    // Fill background
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, COLOR_EXP_BG);

    // 1. Top Navigation & Address Bar
    int32_t bar_h = 32;
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, bar_h, COLOR_EXP_BAR);
    gfx_fill_rect(client_area.x, client_area.y + bar_h - 1, client_area.width, 1, Color(51, 65, 85, 255));

    // [Up] Button
    gfx_fill_rounded_rect(client_area.x + 8, client_area.y + 6, 48, 20, 3, Color(10, 77, 104, 255));
    gfx_draw_rounded_rect(client_area.x + 8, client_area.y + 6, 48, 20, 3, Color(8, 131, 149, 255));
    font_draw_string(client_area.x + 18, client_area.y + 8, "Up", COLOR_WHITE);

    // [Refresh] Button
    gfx_fill_rounded_rect(client_area.x + 62, client_area.y + 6, 68, 20, 3, Color(10, 77, 104, 255));
    gfx_draw_rounded_rect(client_area.x + 62, client_area.y + 6, 68, 20, 3, Color(8, 131, 149, 255));
    font_draw_string(client_area.x + 70, client_area.y + 8, "Reload", COLOR_WHITE);

    // Path Box
    int32_t path_box_x = client_area.x + 138;
    int32_t path_box_w = client_area.width - 146;
    gfx_fill_rounded_rect(path_box_x, client_area.y + 6, path_box_w, 20, 3, Color(15, 23, 42, 255));
    gfx_draw_rounded_rect(path_box_x, client_area.y + 6, path_box_w, 20, 3, Color(51, 65, 85, 255));
    font_draw_string(path_box_x + 8, client_area.y + 8, m_current_path, Color(0, 229, 255, 255));

    // 2. Left Sidebar (Directory Quick-Links)
    int32_t sidebar_w = 118;
    int32_t main_h = client_area.height - bar_h - 130; // Leave 130px for preview
    gfx_fill_rect(client_area.x, client_area.y + bar_h, sidebar_w, main_h, COLOR_EXP_SIDEBAR);
    gfx_fill_rect(client_area.x + sidebar_w, client_area.y + bar_h, 1, main_h, Color(51, 65, 85, 255));

    font_draw_string(client_area.x + 8, client_area.y + bar_h + 8, "LOCATIONS", Color(148, 163, 184, 255));
    font_draw_string(client_area.x + 12, client_area.y + bar_h + 28, "/ (Root)", COLOR_WHITE);
    font_draw_string(client_area.x + 12, client_area.y + bar_h + 52, "/system", COLOR_WHITE);
    font_draw_string(client_area.x + 12, client_area.y + bar_h + 76, "/docs", COLOR_WHITE);
    font_draw_string(client_area.x + 12, client_area.y + bar_h + 100, "/apps", COLOR_WHITE);

    // 3. Right File List Pane
    int32_t list_x = client_area.x + sidebar_w + 1;
    int32_t list_w = client_area.width - sidebar_w - 1;

    for (size_t i = 0; i < m_item_count; ++i) {
        int32_t item_y = client_area.y + bar_h + 6 + static_cast<int32_t>(i) * 20;
        if (item_y + 20 > client_area.y + bar_h + main_h) break;

        bool is_sel = (static_cast<int32_t>(i) == m_selected_index);
        if (is_sel) {
            gfx_fill_rect(list_x + 4, item_y, list_w - 8, 18, COLOR_EXP_SELECTED);
        }

        // Icon & Type tag
        if (m_items[i].type == VFS_TYPE_DIRECTORY) {
            font_draw_string(list_x + 8, item_y + 1, "[DIR]", COLOR_EXP_DIR);
        } else {
            font_draw_string(list_x + 8, item_y + 1, "[FILE]", COLOR_EXP_FILE);
        }

        // Filename
        font_draw_string(list_x + 60, item_y + 1, m_items[i].name, COLOR_WHITE);

        // Size
        if (m_items[i].type == VFS_TYPE_FILE) {
            font_printf(list_x + list_w - 80, item_y + 1, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                        "%u B", static_cast<unsigned int>(m_items[i].size));
        }
    }

    // 4. Bottom File Preview Pane
    int32_t preview_y = client_area.y + bar_h + main_h;
    int32_t preview_h = client_area.height - bar_h - main_h;
    gfx_fill_rect(client_area.x, preview_y, client_area.width, preview_h, COLOR_EXP_PREVIEW);
    gfx_fill_rect(client_area.x, preview_y, client_area.width, 1, Color(8, 131, 149, 255));

    font_draw_string(client_area.x + 8, preview_y + 6, "FILE PREVIEW:", Color(8, 131, 149, 255));

    if (m_preview_is_valid) {
        font_draw_string_bounded(
            Rect(client_area.x + 8, preview_y + 24, client_area.width - 16, preview_h - 28),
            client_area.x + 8, preview_y + 24,
            m_preview_text,
            COLOR_WHITE
        );
    } else if (m_selected_index >= 0 && m_items[m_selected_index].type == VFS_TYPE_DIRECTORY) {
        font_draw_string(client_area.x + 8, preview_y + 24, "[Directory selected - Double-click to browse contents]", Color(148, 163, 184, 255));
    } else {
        font_draw_string(client_area.x + 8, preview_y + 24, "[No file selected or file is empty]", Color(148, 163, 184, 255));
    }
}
