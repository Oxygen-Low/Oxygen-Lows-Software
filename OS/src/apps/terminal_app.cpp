#include "apps/terminal_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "arch/x86_64/pit.h"
#include "arch/x86_64/io.h"
#include "mm/pmm.h"
#include "mm/heap.h"
#include "drivers/serial.h"
#include "drivers/keyboard.h"

static const Color COLOR_TERM_BG     = Color(0, 0, 0, 255);
static const Color COLOR_TERM_PROMPT = Color(0, 229, 255, 255); // Cyan
static const Color COLOR_TERM_TEXT   = Color(237, 237, 237, 255); // Off-white
static const Color COLOR_TERM_GREEN  = Color(0, 255, 102, 255); // Terminal Green
static const Color COLOR_TERM_YELLOW = Color(255, 204, 0, 255);
static const Color COLOR_TERM_RED    = Color(255, 77, 77, 255);

TerminalApp::TerminalApp()
    : m_window(nullptr), m_cursor_row(0), m_cursor_col(0), m_view_offset_row(0),
      m_input_len(0), m_input_pos(0), m_history_count(0), m_history_index(0),
      m_cursor_visible(true), m_last_blink_tick(0) {
    clear_screen();
}

TerminalApp::~TerminalApp() {}

void TerminalApp::on_init(Window* window) {
    m_window = window;
    clear_screen();
    print_line("==================================================");
    print_line("      Oxygen Low's Software — Terminal v1.0       ");
    print_line("==================================================");
    print_line("Type 'help' for available commands.");
    new_line();
    print_prompt();
}

void TerminalApp::clear_screen(void) {
    for (int r = 0; r < TERMINAL_BUFFER_ROWS; ++r) {
        for (int c = 0; c < TERMINAL_MAX_COLS; ++c) {
            m_buffer[r][c] = ' ';
            m_fg_color[r][c] = COLOR_TERM_TEXT;
        }
        m_buffer[r][TERMINAL_MAX_COLS] = '\0';
    }
    m_cursor_row = 0;
    m_cursor_col = 0;
    m_view_offset_row = 0;
    m_input_len = 0;
    m_input_pos = 0;
    m_input_buffer[0] = '\0';
}

void TerminalApp::scroll_up(void) {
    for (int r = 0; r < TERMINAL_BUFFER_ROWS - 1; ++r) {
        for (int c = 0; c < TERMINAL_MAX_COLS; ++c) {
            m_buffer[r][c] = m_buffer[r + 1][c];
            m_fg_color[r][c] = m_fg_color[r + 1][c];
        }
        m_buffer[r][TERMINAL_MAX_COLS] = '\0';
    }
    for (int c = 0; c < TERMINAL_MAX_COLS; ++c) {
        m_buffer[TERMINAL_BUFFER_ROWS - 1][c] = ' ';
        m_fg_color[TERMINAL_BUFFER_ROWS - 1][c] = COLOR_TERM_TEXT;
    }
    m_buffer[TERMINAL_BUFFER_ROWS - 1][TERMINAL_MAX_COLS] = '\0';

    if (m_cursor_row > 0) {
        m_cursor_row--;
    }
}

void TerminalApp::new_line(void) {
    m_cursor_col = 0;
    m_cursor_row++;
    if (m_cursor_row >= 20) { // Screen visible rows
        scroll_up();
    }
}

void TerminalApp::print_char(char c) {
    if (c == '\n') {
        new_line();
    } else if (c == '\r') {
        m_cursor_col = 0;
    } else if (c == '\t') {
        int next_tab = (m_cursor_col + 4) & ~3;
        while (m_cursor_col < next_tab && m_cursor_col < TERMINAL_MAX_COLS) {
            m_buffer[m_cursor_row][m_cursor_col] = ' ';
            m_fg_color[m_cursor_row][m_cursor_col] = COLOR_TERM_TEXT;
            m_cursor_col++;
        }
    } else if (c == '\b') {
        if (m_cursor_col > 0) {
            m_cursor_col--;
            m_buffer[m_cursor_row][m_cursor_col] = ' ';
        }
    } else {
        if (m_cursor_col >= TERMINAL_MAX_COLS) {
            new_line();
        }
        m_buffer[m_cursor_row][m_cursor_col] = c;
        m_fg_color[m_cursor_row][m_cursor_col] = COLOR_TERM_TEXT;
        m_cursor_col++;
    }
}

void TerminalApp::print_string(const char* str) {
    if (!str) return;
    while (*str) {
        print_char(*str++);
    }
}

void TerminalApp::print_line(const char* str) {
    print_string(str);
    new_line();
}

void TerminalApp::print_prompt(void) {
    const char* prompt = "oxygen@os:~$ ";
    while (*prompt) {
        if (m_cursor_col >= TERMINAL_MAX_COLS) {
            new_line();
        }
        m_buffer[m_cursor_row][m_cursor_col] = *prompt;
        m_fg_color[m_cursor_row][m_cursor_col] = COLOR_TERM_PROMPT;
        m_cursor_col++;
        prompt++;
    }
}

static bool str_equals(const char* s1, const char* s2) {
    while (*s1 && *s2) {
        if (*s1 != *s2) return false;
        s1++;
        s2++;
    }
    return *s1 == *s2;
}

static bool str_starts_with(const char* str, const char* prefix) {
    while (*prefix) {
        if (*str != *prefix) return false;
        str++;
        prefix++;
    }
    return true;
}

void TerminalApp::execute_command(const char* cmd) {
    // Trim leading spaces
    while (*cmd == ' ') cmd++;
    if (*cmd == '\0') return;

    // Record in history
    if (m_history_count < TERMINAL_HISTORY_LEN) {
        size_t idx = 0;
        while (cmd[idx] && idx < TERMINAL_INPUT_LEN - 1) {
            m_history[m_history_count][idx] = cmd[idx];
            idx++;
        }
        m_history[m_history_count][idx] = '\0';
        m_history_count++;
    }
    m_history_index = m_history_count;

    if (str_equals(cmd, "help")) {
        print_line("Oxygen Low's Software — Interactive Shell");
        print_line("Available Commands:");
        print_line("  help      - Display this help manual");
        print_line("  clear     - Clear terminal buffer");
        print_line("  echo      - Print arguments to terminal");
        print_line("  sysinfo   - Display system diagnostics");
        print_line("  uname     - Print system kernel architecture");
        print_line("  about     - Information about Oxygen Low's Software");
        print_line("  time      - Print current system time and uptime");
        print_line("  uptime    - Print system uptime");
        print_line("  mem       - Print physical memory allocation stats");
        print_line("  calc      - Evaluate simple arithmetic expression");
        print_line("  reboot    - Reboot the operating system");
        print_line("  exit      - Close terminal window");
    } else if (str_equals(cmd, "clear")) {
        clear_screen();
        return;
    } else if (str_starts_with(cmd, "echo")) {
        const char* arg = cmd + 4;
        while (*arg == ' ') arg++;
        print_line(arg);
    } else if (str_equals(cmd, "sysinfo")) {
        print_line("OS Name:       Oxygen Low's Software");
        print_line("Kernel:        v1.0.0 (Freestanding C++)");
        print_line("Architecture:  x86_64 Long Mode");
        print_line("Display:       1024x768 @ 32bpp Direct RGB");
        
        size_t total_mb = pmm_get_total_memory() / (1024 * 1024);
        size_t used_mb  = pmm_get_used_memory() / (1024 * 1024);
        size_t free_mb  = pmm_get_free_memory() / (1024 * 1024);
        // Format memory
        print_string("Memory:        Total: ");
        print_char('0' + (total_mb / 100) % 10);
        print_char('0' + (total_mb / 10) % 10);
        print_char('0' + total_mb % 10);
        print_string(" MB | Used: ");
        print_char('0' + (used_mb / 10) % 10);
        print_char('0' + used_mb % 10);
        print_string(" MB | Free: ");
        print_char('0' + (free_mb / 100) % 10);
        print_char('0' + (free_mb / 10) % 10);
        print_char('0' + free_mb % 10);
        print_line(" MB");

        uint64_t uptime_sec = pit_get_uptime_ms() / 1000;
        uint32_t hr = static_cast<uint32_t>(uptime_sec / 3600);
        uint32_t mn = static_cast<uint32_t>((uptime_sec / 60) % 60);
        uint32_t sc = static_cast<uint32_t>(uptime_sec % 60);
        print_string("Uptime:        ");
        print_char('0' + (hr / 10) % 10); print_char('0' + hr % 10); print_string("h ");
        print_char('0' + (mn / 10) % 10); print_char('0' + mn % 10); print_string("m ");
        print_char('0' + (sc / 10) % 10); print_char('0' + sc % 10); print_line("s");
    } else if (str_equals(cmd, "uname")) {
        print_line("Oxygen Low's Software 1.0.0 x86_64 Freestanding C++");
    } else if (str_equals(cmd, "about")) {
        print_line("==================================================");
        print_line("              Oxygen Low's Software               ");
        print_line("     Bare-Metal 64-bit Desktop Operating System   ");
        print_line("==================================================");
        print_line("Engineered with high performance freestanding C++,");
        print_line("featuring preemptive interrupt scheduling, direct ");
        print_line("RGB framebuffer blitting, and window compositing.");
    } else if (str_equals(cmd, "time") || str_equals(cmd, "date")) {
        uint64_t uptime_ms = pit_get_uptime_ms();
        uint64_t sec = (uptime_ms / 1000) % 60;
        uint64_t min = (uptime_ms / 60000) % 60;
        uint64_t hr  = (uptime_ms / 3600000) % 24;
        print_string("System Time: ");
        print_char('0' + (hr / 10) % 10); print_char('0' + hr % 10); print_char(':');
        print_char('0' + (min / 10) % 10); print_char('0' + min % 10); print_char(':');
        print_char('0' + (sec / 10) % 10); print_char('0' + sec % 10);
        print_line(" UTC");
    } else if (str_equals(cmd, "uptime")) {
        uint64_t ms = pit_get_uptime_ms();
        print_string("Uptime: ");
        print_char('0' + (ms / 1000) % 10);
        print_line(" seconds");
    } else if (str_equals(cmd, "mem")) {
        size_t total = pmm_get_total_memory();
        size_t used  = pmm_get_used_memory();
        size_t free_mem = pmm_get_free_memory();
        size_t heap_used = heap_get_used_bytes();
        print_string("PMM Total: "); print_char('0' + (total / (1024*1024*100)) % 10); print_char('0' + (total / (1024*1024*10)) % 10); print_char('0' + (total / (1024*1024)) % 10); print_line(" MB");
        print_string("PMM Used:  "); print_char('0' + (used / (1024*1024*10)) % 10); print_char('0' + (used / (1024*1024)) % 10); print_line(" MB");
        print_string("PMM Free:  "); print_char('0' + (free_mem / (1024*1024*100)) % 10); print_char('0' + (free_mem / (1024*1024*10)) % 10); print_char('0' + (free_mem / (1024*1024)) % 10); print_line(" MB");
        print_string("Heap Used: "); print_char('0' + (heap_used / (1024*1024)) % 10); print_line(" MB");
    } else if (str_starts_with(cmd, "calc")) {
        // Simple 2-operand evaluator: e.g. calc 24 + 18
        const char* p = cmd + 4;
        while (*p == ' ') p++;
        int a = 0;
        while (*p >= '0' && *p <= '9') { a = a * 10 + (*p - '0'); p++; }
        while (*p == ' ') p++;
        char op = *p++;
        while (*p == ' ') p++;
        int b = 0;
        while (*p >= '0' && *p <= '9') { b = b * 10 + (*p - '0'); p++; }
        
        int res = 0;
        if (op == '+') res = a + b;
        else if (op == '-') res = a - b;
        else if (op == '*') res = a * b;
        else if (op == '/' && b != 0) res = a / b;
        else if (op == '%' && b != 0) res = a % b;
        else if (op == '/' && b == 0) {
            print_line("Error: Division by zero");
            return;
        }

        print_string("Result: ");
        if (res == 0) print_char('0');
        else {
            if (res < 0) { print_char('-'); res = -res; }
            char buf[16]; int idx = 0;
            while (res > 0) { buf[idx++] = '0' + (res % 10); res /= 10; }
            for (int i = idx - 1; i >= 0; --i) print_char(buf[i]);
        }
        new_line();
    } else if (str_equals(cmd, "reboot")) {
        print_line("Rebooting Oxygen Low's Software...");
        outb(0x64, 0xFE);
    } else if (str_equals(cmd, "exit")) {
        if (m_window) wm_close_window(m_window);
    } else {
        print_string("Command not found: ");
        print_string(cmd);
        print_line(". Type 'help' for available commands.");
    }
}

void TerminalApp::on_key_down(uint8_t scancode, char ascii) {
    if (scancode == KEY_SCAN_UP) {
        if (m_history_count > 0 && m_history_index > 0) {
            m_history_index--;
            // Erase current input from terminal
            while (m_input_len > 0) {
                print_char('\b');
                m_input_len--;
            }
            // Copy from history
            const char* hist = m_history[m_history_index];
            while (*hist && m_input_len < TERMINAL_INPUT_LEN - 1) {
                m_input_buffer[m_input_len++] = *hist;
                print_char(*hist);
                hist++;
            }
            m_input_buffer[m_input_len] = '\0';
        }
        return;
    }

    if (ascii == '\n' || ascii == '\r') {
        new_line();
        m_input_buffer[m_input_len] = '\0';
        execute_command(m_input_buffer);
        m_input_len = 0;
        m_input_pos = 0;
        m_input_buffer[0] = '\0';
        print_prompt();
    } else if (ascii == '\b') {
        if (m_input_len > 0) {
            m_input_len--;
            m_input_buffer[m_input_len] = '\0';
            print_char('\b');
        }
    } else if (ascii >= 32 && ascii <= 126) {
        if (m_input_len < TERMINAL_INPUT_LEN - 1) {
            m_input_buffer[m_input_len++] = ascii;
            m_input_buffer[m_input_len] = '\0';
            print_char(ascii);
        }
    }
}

void TerminalApp::on_update(void) {
    uint64_t tick = pit_get_uptime_ms();
    if (tick - m_last_blink_tick >= 500) {
        m_last_blink_tick = tick;
        m_cursor_visible = !m_cursor_visible;
    }
}

void TerminalApp::on_paint(const Rect& client_area) {
    // Fill client background with Pure Black
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, COLOR_TERM_BG);

    int32_t start_x = client_area.x + 6;
    int32_t start_y = client_area.y + 6;

    int32_t visible_rows = (client_area.height - 12) / FONT_LINE_SPACING;
    if (visible_rows > 22) visible_rows = 22;

    for (int32_t r = 0; r < visible_rows && r < TERMINAL_BUFFER_ROWS; ++r) {
        int32_t draw_y = start_y + r * FONT_LINE_SPACING;
        for (int32_t c = 0; c < TERMINAL_MAX_COLS; ++c) {
            char ch = m_buffer[r][c];
            if (ch != ' ' && ch != '\0') {
                font_draw_char(start_x + c * FONT_CHAR_WIDTH, draw_y, ch, m_fg_color[r][c], COLOR_TRANSPARENT);
            }
        }
    }

    // Draw blinking cursor block
    if (m_cursor_visible && m_cursor_row < visible_rows) {
        int32_t cursor_x = start_x + m_cursor_col * FONT_CHAR_WIDTH;
        int32_t cursor_y = start_y + m_cursor_row * FONT_LINE_SPACING;
        gfx_fill_rect(cursor_x, cursor_y + FONT_CHAR_HEIGHT - 3, FONT_CHAR_WIDTH, 2, COLOR_TERM_GREEN);
    }
}
