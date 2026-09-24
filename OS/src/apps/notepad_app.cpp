#include "apps/notepad_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "gui/theme.h"
#include "arch/x86_64/pit.h"
#include "drivers/keyboard.h"
#include "fs/vfs.h"

static const Color COLOR_NOTEPAD_TOOLBAR = Color(226, 232, 240, 255); // Slate 200
static const Color COLOR_NOTEPAD_MARGIN  = Color(241, 245, 249, 255); // Slate 100
static const Color COLOR_NOTEPAD_MARGIN_TEXT = Color(148, 163, 184, 255); // Slate 400
static const Color COLOR_NOTEPAD_TEXT_BG = Color(255, 255, 255, 255); // Pure White
static const Color COLOR_NOTEPAD_TEXT    = Color(15, 23, 42, 255);   // Slate 900
static const Color COLOR_NOTEPAD_CURSOR  = Color(2, 132, 199, 255);  // Sky 600
static const Color COLOR_NOTEPAD_STATUS  = Color(241, 245, 249, 255);

NotepadApp::NotepadApp()
    : m_window(nullptr), m_buffer_len(0), m_cursor_pos(0),
      m_cursor_line(1), m_cursor_col(1), m_scroll_line(0),
      m_cursor_blink(true), m_last_blink_tick(0) {
    m_current_filepath[0] = '\0';
    m_file_dialog.visible = false;
    clear_document();
}

NotepadApp::~NotepadApp() {}

void NotepadApp::on_init(Window* window) {
    m_window = window;
    clear_document();
    
    // Initial welcome text
    const char* default_text =
        "Welcome to Oxygen Low's Software Notepad!\n"
        "-----------------------------------------\n"
        "This is a genuine multi-line text editor\n"
        "running bare-metal on x86_64 Long Mode.\n\n"
        "Features:\n"
        "- File Open & Save integration with VFS\n"
        "- Contiguous 64KB text buffer\n"
        "- Real-time cursor navigation & line tracking\n"
        "- Built for Oxygen Low's Software OS.\n\n"
        "Start typing below:\n";

    while (*default_text && m_buffer_len < NOTEPAD_MAX_BUFFER_SIZE - 1) {
        m_buffer[m_buffer_len++] = *default_text++;
    }
    m_buffer[m_buffer_len] = '\0';
    m_cursor_pos = static_cast<int32_t>(m_buffer_len);
    update_line_col();
}

void NotepadApp::on_resize(int32_t width, int32_t height) {
    UNUSED(width);
    UNUSED(height);
    if (m_window) m_window->is_dirty = true;
}

void NotepadApp::clear_document(void) {
    m_buffer[0] = '\0';
    m_buffer_len = 0;
    m_cursor_pos = 0;
    m_cursor_line = 1;
    m_cursor_col = 1;
    m_scroll_line = 0;
    m_current_filepath[0] = '\0';
}

bool NotepadApp::open_file(const char* path) {
    if (!path) return false;
    VFSNode* node = vfs_resolve_path(path);
    if (!node || node->type != VFS_TYPE_FILE) return false;

    clear_document();
    size_t rd = vfs_read(node, 0, NOTEPAD_MAX_BUFFER_SIZE - 1, reinterpret_cast<uint8_t*>(m_buffer));
    m_buffer[rd] = '\0';
    m_buffer_len = rd;
    m_cursor_pos = 0;
    update_line_col();

    // Store filepath
    size_t i = 0;
    while (path[i] && i < sizeof(m_current_filepath) - 1) {
        m_current_filepath[i] = path[i];
        i++;
    }
    m_current_filepath[i] = '\0';

    if (m_window) {
        // Update title to show opened file
        const char* p = path;
        const char* last_slash = path;
        while (*p) { if (*p == '/') last_slash = p + 1; p++; }
        
        char new_title[64] = "Notepad - ";
        size_t tlen = 10;
        while (*last_slash && tlen < 63) {
            new_title[tlen++] = *last_slash++;
        }
        new_title[tlen] = '\0';
        
        size_t c = 0;
        while (new_title[c] && c < 63) {
            m_window->title[c] = new_title[c];
            c++;
        }
        m_window->title[c] = '\0';
        m_window->is_dirty = true;
    }
    return true;
}

bool NotepadApp::save_file(const char* path) {
    if (!path) return false;
    VFSNode* node = vfs_create_file(path, m_buffer);
    if (!node) return false;

    size_t i = 0;
    while (path[i] && i < sizeof(m_current_filepath) - 1) {
        m_current_filepath[i] = path[i];
        i++;
    }
    m_current_filepath[i] = '\0';

    if (m_window) {
        const char* p = path;
        const char* last_slash = path;
        while (*p) { if (*p == '/') last_slash = p + 1; p++; }
        
        char new_title[64] = "Notepad - ";
        size_t tlen = 10;
        while (*last_slash && tlen < 63) {
            new_title[tlen++] = *last_slash++;
        }
        new_title[tlen] = '\0';
        
        size_t c = 0;
        while (new_title[c] && c < 63) {
            m_window->title[c] = new_title[c];
            c++;
        }
        m_window->title[c] = '\0';
        m_window->is_dirty = true;
    }
    return true;
}

void NotepadApp::update_line_col(void) {
    int32_t line = 1;
    int32_t col = 1;

    for (int32_t i = 0; i < m_cursor_pos && i < static_cast<int32_t>(m_buffer_len); ++i) {
        if (m_buffer[i] == '\n') {
            line++;
            col = 1;
        } else {
            col++;
        }
    }

    m_cursor_line = line;
    m_cursor_col = col;
}

void NotepadApp::insert_char(char c) {
    if (m_buffer_len >= NOTEPAD_MAX_BUFFER_SIZE - 1) return;

    for (int32_t i = static_cast<int32_t>(m_buffer_len); i > m_cursor_pos; --i) {
        m_buffer[i] = m_buffer[i - 1];
    }
    m_buffer[m_cursor_pos++] = c;
    m_buffer_len++;
    m_buffer[m_buffer_len] = '\0';

    update_line_col();
}

void NotepadApp::delete_backspace(void) {
    if (m_cursor_pos <= 0 || m_buffer_len == 0) return;

    for (int32_t i = m_cursor_pos - 1; i < static_cast<int32_t>(m_buffer_len) - 1; ++i) {
        m_buffer[i] = m_buffer[i + 1];
    }
    m_cursor_pos--;
    m_buffer_len--;
    m_buffer[m_buffer_len] = '\0';

    update_line_col();
}

void NotepadApp::delete_forward(void) {
    if (m_cursor_pos >= static_cast<int32_t>(m_buffer_len) || m_buffer_len == 0) return;

    for (int32_t i = m_cursor_pos; i < static_cast<int32_t>(m_buffer_len) - 1; ++i) {
        m_buffer[i] = m_buffer[i + 1];
    }
    m_buffer_len--;
    m_buffer[m_buffer_len] = '\0';

    update_line_col();
}

void NotepadApp::new_line(void) {
    insert_char('\n');
}

void NotepadApp::on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
    // If File Dialog is open, forward mouse events to it
    if (m_file_dialog.visible && m_window) {
        int32_t dlg_w = 400;
        int32_t dlg_h = 240;
        if (dlg_w > m_window->client_bounds.width - 20) dlg_w = m_window->client_bounds.width - 20;
        if (dlg_h > m_window->client_bounds.height - 20) dlg_h = m_window->client_bounds.height - 20;

        int32_t dlg_x = (m_window->client_bounds.width - dlg_w) / 2;
        int32_t dlg_y = (m_window->client_bounds.height - dlg_h) / 2;
        Rect dlg_rect(dlg_x, dlg_y, dlg_w, dlg_h);

        file_dialog_handle_mouse(&m_file_dialog, local_x, local_y, buttons, dlg_rect);

        if (m_file_dialog.is_done) {
            if (m_file_dialog.mode == FILE_DIALOG_OPEN) {
                open_file(m_file_dialog.result_path);
            } else {
                save_file(m_file_dialog.result_path);
            }
            m_file_dialog.visible = false;
        }
        m_window->is_dirty = true;
        return;
    }

    // Check Toolbar buttons (y: 2 to 24)
    if (local_y >= 2 && local_y <= 24) {
        if (local_x >= 6 && local_x <= 56) {
            // [New]
            clear_document();
            if (m_window) {
                const char* t = "Notepad - Oxygen Low's Software";
                size_t c = 0;
                while (t[c] && c < 63) { m_window->title[c] = t[c]; c++; }
                m_window->title[c] = '\0';
            }
        } else if (local_x >= 62 && local_x <= 116) {
            // [Open]
            file_dialog_open(&m_file_dialog, FILE_DIALOG_OPEN, "/docs");
        } else if (local_x >= 122 && local_x <= 176) {
            // [Save]
            file_dialog_open(&m_file_dialog, FILE_DIALOG_SAVE, "/docs");
        } else if (local_x >= 182 && local_x <= 236) {
            // [Clear]
            clear_document();
        } else if (local_x >= 242 && local_x <= 296) {
            // [About]
            clear_document();
            const char* about_text = "Oxygen Low's Software Notepad Text Editor\nBuilt with freestanding C++17.\nIncludes Save & Open File Dialog.";
            while (*about_text) insert_char(*about_text++);
        }
        if (m_window) m_window->is_dirty = true;
    }
}

void NotepadApp::on_key_down(uint8_t scancode, char ascii) {
    if (m_file_dialog.visible) {
        file_dialog_handle_key(&m_file_dialog, scancode, ascii);
        if (m_file_dialog.is_done) {
            if (m_file_dialog.mode == FILE_DIALOG_OPEN) {
                open_file(m_file_dialog.result_path);
            } else {
                save_file(m_file_dialog.result_path);
            }
            m_file_dialog.visible = false;
        }
        if (m_window) m_window->is_dirty = true;
        return;
    }

    if (scancode == KEY_SCAN_LEFT) {
        if (m_cursor_pos > 0) {
            m_cursor_pos--;
            update_line_col();
        }
        return;
    } else if (scancode == KEY_SCAN_RIGHT) {
        if (m_cursor_pos < static_cast<int32_t>(m_buffer_len)) {
            m_cursor_pos++;
            update_line_col();
        }
        return;
    } else if (scancode == KEY_SCAN_UP) {
        int32_t cur = m_cursor_pos;
        while (cur > 0 && m_buffer[cur - 1] != '\n') cur--;
        if (cur > 0) {
            cur--;
            int32_t prev_line_start = cur;
            while (prev_line_start > 0 && m_buffer[prev_line_start - 1] != '\n') prev_line_start--;
            int32_t prev_line_len = cur - prev_line_start;
            int32_t target_col = (m_cursor_col - 1 < prev_line_len) ? (m_cursor_col - 1) : prev_line_len;
            m_cursor_pos = prev_line_start + target_col;
            update_line_col();
        }
        return;
    } else if (scancode == KEY_SCAN_DOWN) {
        int32_t cur = m_cursor_pos;
        while (cur < static_cast<int32_t>(m_buffer_len) && m_buffer[cur] != '\n') cur++;
        if (cur < static_cast<int32_t>(m_buffer_len)) {
            cur++;
            int32_t next_line_start = cur;
            while (cur < static_cast<int32_t>(m_buffer_len) && m_buffer[cur] != '\n') cur++;
            int32_t next_line_len = cur - next_line_start;
            int32_t target_col = (m_cursor_col - 1 < next_line_len) ? (m_cursor_col - 1) : next_line_len;
            m_cursor_pos = next_line_start + target_col;
            update_line_col();
        }
        return;
    } else if (scancode == KEY_SCAN_DELETE) {
        delete_forward();
        return;
    } else if (scancode == KEY_SCAN_HOME) {
        while (m_cursor_pos > 0 && m_buffer[m_cursor_pos - 1] != '\n') m_cursor_pos--;
        update_line_col();
        return;
    } else if (scancode == KEY_SCAN_END) {
        while (m_cursor_pos < static_cast<int32_t>(m_buffer_len) && m_buffer[m_cursor_pos] != '\n') m_cursor_pos++;
        update_line_col();
        return;
    }

    if (ascii == '\n' || ascii == '\r') {
        new_line();
    } else if (ascii == '\b') {
        delete_backspace();
    } else if (ascii == '\t') {
        for (int i = 0; i < 4; ++i) insert_char(' ');
    } else if (ascii >= 32 && ascii <= 126) {
        insert_char(ascii);
    }
}

void NotepadApp::on_update(void) {
    uint64_t tick = pit_get_uptime_ms();
    if (tick - m_last_blink_tick >= 500) {
        m_last_blink_tick = tick;
        m_cursor_blink = !m_cursor_blink;
        if (m_window) m_window->is_dirty = true;
    }
}

void NotepadApp::on_paint(const Rect& client_area) {
    // 1. Toolbar at Top
    int32_t tb_h = 26;
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, tb_h, COLOR_NOTEPAD_TOOLBAR);
    gfx_fill_rect(client_area.x, client_area.y + tb_h - 1, client_area.width, 1, Color(203, 213, 225, 255));

    // [New]
    gfx_fill_rounded_rect(client_area.x + 6, client_area.y + 3, 50, 20, 3, Color(255, 255, 255, 255));
    gfx_draw_rounded_rect(client_area.x + 6, client_area.y + 3, 50, 20, 3, Color(203, 213, 225, 255));
    font_draw_string(client_area.x + 16, client_area.y + 5, "New", COLOR_NOTEPAD_TEXT);

    // [Open]
    gfx_fill_rounded_rect(client_area.x + 62, client_area.y + 3, 54, 20, 3, Color(255, 255, 255, 255));
    gfx_draw_rounded_rect(client_area.x + 62, client_area.y + 3, 54, 20, 3, Color(203, 213, 225, 255));
    font_draw_string(client_area.x + 70, client_area.y + 5, "Open", COLOR_NOTEPAD_TEXT);

    // [Save]
    gfx_fill_rounded_rect(client_area.x + 122, client_area.y + 3, 54, 20, 3, Color(255, 255, 255, 255));
    gfx_draw_rounded_rect(client_area.x + 122, client_area.y + 3, 54, 20, 3, Color(203, 213, 225, 255));
    font_draw_string(client_area.x + 130, client_area.y + 5, "Save", COLOR_NOTEPAD_TEXT);

    // [Clear]
    gfx_fill_rounded_rect(client_area.x + 182, client_area.y + 3, 54, 20, 3, Color(255, 255, 255, 255));
    gfx_draw_rounded_rect(client_area.x + 182, client_area.y + 3, 54, 20, 3, Color(203, 213, 225, 255));
    font_draw_string(client_area.x + 190, client_area.y + 5, "Clear", COLOR_NOTEPAD_TEXT);

    // [About]
    gfx_fill_rounded_rect(client_area.x + 242, client_area.y + 3, 54, 20, 3, Color(255, 255, 255, 255));
    gfx_draw_rounded_rect(client_area.x + 242, client_area.y + 3, 54, 20, 3, Color(203, 213, 225, 255));
    font_draw_string(client_area.x + 248, client_area.y + 5, "About", COLOR_NOTEPAD_TEXT);

    // 2. Status Bar at Bottom
    int32_t status_h = 22;
    int32_t status_y = client_area.y + client_area.height - status_h;
    gfx_fill_rect(client_area.x, status_y, client_area.width, status_h, COLOR_NOTEPAD_STATUS);
    gfx_fill_rect(client_area.x, status_y, client_area.width, 1, Color(203, 213, 225, 255));

    font_printf(client_area.x + 8, status_y + 4, Color(100, 116, 139, 255), COLOR_TRANSPARENT,
                "Ln %d, Col %d | Length: %u | Oxygen Low's Software%s%s",
                m_cursor_line, m_cursor_col, static_cast<unsigned int>(m_buffer_len),
                m_current_filepath[0] ? " | " : "", m_current_filepath);

    // 3. Line Numbers Margin (Left)
    int32_t margin_w = 40;
    int32_t editor_y = client_area.y + tb_h;
    int32_t editor_h = client_area.height - tb_h - status_h;
    gfx_fill_rect(client_area.x, editor_y, margin_w, editor_h, COLOR_NOTEPAD_MARGIN);
    gfx_fill_rect(client_area.x + margin_w - 1, editor_y, 1, editor_h, Color(203, 213, 225, 255));

    // 4. Editor Text Area (White Background)
    int32_t text_area_x = client_area.x + margin_w;
    int32_t text_area_w = client_area.width - margin_w;
    gfx_fill_rect(text_area_x, editor_y, text_area_w, editor_h, COLOR_NOTEPAD_TEXT_BG);

    // Render Text & Line Numbers
    int32_t cur_line = 1;
    int32_t cur_x = text_area_x + 6;
    int32_t cur_y = editor_y + 4;

    font_printf(client_area.x + 8, cur_y, COLOR_NOTEPAD_MARGIN_TEXT, COLOR_TRANSPARENT, "%3d", cur_line);

    int32_t cursor_draw_x = cur_x;
    int32_t cursor_draw_y = cur_y;

    for (int32_t i = 0; i <= static_cast<int32_t>(m_buffer_len); ++i) {
        if (i == m_cursor_pos) {
            cursor_draw_x = cur_x;
            cursor_draw_y = cur_y;
        }

        if (i == static_cast<int32_t>(m_buffer_len)) break;

        char ch = m_buffer[i];
        if (ch == '\n') {
            cur_line++;
            cur_x = text_area_x + 6;
            cur_y += FONT_LINE_SPACING;
            if (cur_y + FONT_LINE_SPACING <= status_y) {
                font_printf(client_area.x + 8, cur_y, COLOR_NOTEPAD_MARGIN_TEXT, COLOR_TRANSPARENT, "%3d", cur_line);
            }
        } else if (ch == '\r') {
            cur_x = text_area_x + 6;
        } else if (ch == '\t') {
            cur_x += FONT_CHAR_WIDTH * 4;
        } else {
            if (cur_y + FONT_CHAR_HEIGHT <= status_y && cur_x + FONT_CHAR_WIDTH <= client_area.x + client_area.width) {
                font_draw_char(cur_x, cur_y, ch, COLOR_NOTEPAD_TEXT, COLOR_TRANSPARENT);
            }
            cur_x += FONT_CHAR_WIDTH;
        }
    }

    // Blinking vertical cursor bar
    if (m_cursor_blink && cursor_draw_y + FONT_CHAR_HEIGHT <= status_y) {
        gfx_fill_rect(cursor_draw_x, cursor_draw_y, 2, FONT_CHAR_HEIGHT, COLOR_NOTEPAD_CURSOR);
    }

    // 5. Render File Dialog if active
    if (m_file_dialog.visible) {
        int32_t dlg_w = 420;
        int32_t dlg_h = 240;
        if (dlg_w > client_area.width - 20) dlg_w = client_area.width - 20;
        if (dlg_h > client_area.height - 20) dlg_h = client_area.height - 20;

        int32_t dlg_x = client_area.x + (client_area.width - dlg_w) / 2;
        int32_t dlg_y = client_area.y + (client_area.height - dlg_h) / 2;
        Rect dlg_rect(dlg_x, dlg_y, dlg_w, dlg_h);

        file_dialog_render(&m_file_dialog, dlg_rect);
    }
}
