#include "apps/terminal_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "arch/x86_64/pit.h"
#include "arch/x86_64/io.h"
#include "mm/pmm.h"
#include "mm/heap.h"
#include "drivers/serial.h"
#include "drivers/keyboard.h"
#include "drivers/speaker.h"
#include "drivers/ata.h"
#include "drivers/pci.h"
#include "drivers/vbox_guest.h"
#include "drivers/vbox_hgcm.h"
#include "drivers/vbe.h"
#include "arch/x86_64/acpi.h"
#include "arch/x86_64/hpet.h"
#include "fs/vfs.h"
#include "kernel/sched.h"
#include "gui/theme.h"

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
    int32_t visible_rows = 22;
    if (m_window && m_window->client_bounds.height > 0) {
        visible_rows = (m_window->client_bounds.height - 12) / FONT_LINE_SPACING;
        if (visible_rows <= 0) visible_rows = 22;
    }
    if (m_cursor_row >= visible_rows) {
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
        print_line("  ps        - List running scheduler tasks");
        print_line("  kill <id> - Terminate a running task");
        print_line("  ls [path] - List directory files and folders");
        print_line("  cat <file>- Print contents of a file");
        print_line("  mkdir <d> - Create a directory");
        print_line("  touch <f> - Create an empty file");
        print_line("  disk      - Show IDE/ATA storage devices");
        print_line("  beep [f d]- Play tone on PC Speaker");
        print_line("  chime     - Play startup chime melody");
        print_line("  theme <t> - Switch theme (cyan, dark, matrix, purple, light)");
        print_line("  lspci     - Enumerate PCI bus hardware devices");
        print_line("  vbox      - Show VirtualBox Guest Integration status");
        print_line("  res <w h> - Change display resolution (e.g. res 1024 768)");
        print_line("  poweroff  - Clean ACPI guest shutdown");
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
    } else if (str_equals(cmd, "ps") || str_equals(cmd, "tasks")) {
        print_line("PID  NAME             STATE    PRIO  CPU%   STACK");
        print_line("---  ---------------  -------  ----  ----   -----");
        size_t count = sched_get_task_count();
        for (size_t i = 0; i < count; ++i) {
            TaskInfo info;
            if (sched_get_task_info(i, &info)) {
                print_char('0' + (info.id / 10) % 10);
                print_char('0' + (info.id % 10));
                print_string("   ");
                print_string(info.name);
                size_t nlen = 0; while (info.name[nlen]) nlen++;
                for (size_t s = nlen; s < 17; ++s) print_char(' ');
                
                const char* st = (info.state == TASK_RUNNING) ? "RUNNING" :
                                 ((info.state == TASK_SLEEPING) ? "SLEEP" :
                                 ((info.state == TASK_TERMINATED) ? "DEAD" : "READY"));
                print_string(st);
                size_t slen = 0; while (st[slen]) slen++;
                for (size_t s = slen; s < 9; ++s) print_char(' ');

                print_char('0' + (info.priority % 10));
                print_string("     ");
                print_char('0' + (info.cpu_usage_pct / 10) % 10);
                print_char('0' + (info.cpu_usage_pct % 10));
                print_string("%    ");
                print_char('0' + (info.stack_size / 10240) % 10);
                print_char('0' + (info.stack_size / 1024) % 10);
                print_line(" KB");
            }
        }
    } else if (str_starts_with(cmd, "kill")) {
        const char* p = cmd + 4;
        while (*p == ' ') p++;
        uint32_t pid = 0;
        while (*p >= '0' && *p <= '9') { pid = pid * 10 + (*p - '0'); p++; }
        if (pid == 0) {
            print_line("Usage: kill <pid>");
        } else if (sched_kill_task(pid)) {
            print_line("Task terminated successfully.");
        } else {
            print_line("Error: Invalid PID or cannot kill task.");
        }
    } else if (str_starts_with(cmd, "ls")) {
        const char* p = cmd + 2;
        while (*p == ' ') p++;
        const char* path = (*p == '\0') ? "/" : p;
        VFSNode* node = vfs_resolve_path(path);
        if (!node) {
            print_line("Error: Path not found.");
        } else if (node->type != VFS_TYPE_DIRECTORY) {
            print_line("Error: Path is not a directory.");
        } else {
            print_string("Directory listing of: ");
            print_line(path);
            for (size_t i = 0; i < node->child_count; ++i) {
                VFSDirectoryEntry e;
                if (vfs_readdir(node, i, &e)) {
                    if (e.type == VFS_TYPE_DIRECTORY) {
                        print_string("  [DIR]  ");
                    } else {
                        print_string("  [FILE] ");
                    }
                    print_string(e.name);
                    if (e.type == VFS_TYPE_FILE) {
                        print_string(" (");
                        print_char('0' + (e.size / 100) % 10);
                        print_char('0' + (e.size / 10) % 10);
                        print_char('0' + e.size % 10);
                        print_string(" B)");
                    }
                    new_line();
                }
            }
        }
    } else if (str_starts_with(cmd, "cat")) {
        const char* p = cmd + 3;
        while (*p == ' ') p++;
        if (*p == '\0') {
            print_line("Usage: cat <file_path>");
        } else {
            VFSNode* node = vfs_resolve_path(p);
            if (!node || node->type != VFS_TYPE_FILE) {
                print_line("Error: File not found.");
            } else {
                char buf[512];
                size_t rd = vfs_read(node, 0, sizeof(buf) - 1, (uint8_t*)buf);
                buf[rd] = '\0';
                print_line(buf);
            }
        }
    } else if (str_starts_with(cmd, "mkdir")) {
        const char* p = cmd + 5;
        while (*p == ' ') p++;
        if (*p == '\0') {
            print_line("Usage: mkdir <directory_path>");
        } else if (vfs_create_directory(p)) {
            print_line("Directory created successfully.");
        } else {
            print_line("Error: Failed to create directory.");
        }
    } else if (str_starts_with(cmd, "touch")) {
        const char* p = cmd + 5;
        while (*p == ' ') p++;
        if (*p == '\0') {
            print_line("Usage: touch <file_path>");
        } else if (vfs_create_file(p, "")) {
            print_line("File created successfully.");
        } else {
            print_line("Error: Failed to create file.");
        }
    } else if (str_equals(cmd, "disk") || str_equals(cmd, "ata")) {
        print_line("IDE / ATA Storage Devices:");
        for (uint8_t d = 0; d < 4; ++d) {
            const ATADriveInfo* info = ata_get_drive_info(d);
            if (info && info->present) {
                print_string("Drive ");
                print_char('0' + d);
                print_string(": ");
                print_string(info->model);
                print_string(" | ");
                print_char('0' + (info->size_in_mb / 100) % 10);
                print_char('0' + (info->size_in_mb / 10) % 10);
                print_char('0' + info->size_in_mb % 10);
                print_line(" MB");
            }
        }
    } else if (str_starts_with(cmd, "beep")) {
        const char* p = cmd + 4;
        while (*p == ' ') p++;
        uint32_t freq = 1000;
        uint32_t dur = 200;
        if (*p >= '0' && *p <= '9') {
            freq = 0;
            while (*p >= '0' && *p <= '9') { freq = freq * 10 + (*p - '0'); p++; }
            while (*p == ' ') p++;
            if (*p >= '0' && *p <= '9') {
                dur = 0;
                while (*p >= '0' && *p <= '9') { dur = dur * 10 + (*p - '0'); p++; }
            }
        }
        speaker_beep(freq, dur);
        print_line("Beep played on PC Speaker.");
    } else if (str_equals(cmd, "chime")) {
        speaker_play_startup_chime();
        print_line("Played Oxygen Low's Software chime.");
    } else if (str_starts_with(cmd, "theme")) {
        const char* p = cmd + 5;
        while (*p == ' ') p++;
        if (*p == '\0') {
            print_string("Current theme: ");
            print_line(theme_get_current()->name);
            print_line("Available: cyan, dark, matrix, purple, light");
        } else if (theme_set_by_name(p)) {
            print_string("Switched desktop theme to: ");
            print_line(theme_get_current()->name);
        } else {
            print_line("Unknown theme. Choices: cyan, dark, matrix, purple, light");
        }
    } else if (str_equals(cmd, "history")) {
        print_line("Command History:");
        for (size_t i = 0; i < m_history_count; ++i) {
            print_char('0' + ((i + 1) / 10) % 10);
            print_char('0' + ((i + 1) % 10));
            print_string("  ");
            print_line(m_history[i]);
        }
    } else if (str_equals(cmd, "lspci")) {
        print_line("PCI Hardware Bus Enumeration:");
        print_line("BUS:SL.FN  VENDOR DEVICE CLASS SUB  IRQ");
        print_line("---------  ------ ------ ----- ---  ---");
        size_t count = pci_get_device_count();
        for (size_t i = 0; i < count; ++i) {
            const PCIDevice* dev = pci_get_device(i);
            if (!dev) continue;
            // Bus:Slot.Func
            print_char('0' + (dev->bus / 10) % 10);
            print_char('0' + (dev->bus % 10));
            print_char(':');
            print_char('0' + (dev->slot / 10) % 10);
            print_char('0' + (dev->slot % 10));
            print_char('.');
            print_char('0' + (dev->func % 10));
            print_string("    0x");
            // Vendor hex
            const char* hex = "0123456789ABCDEF";
            print_char(hex[(dev->vendor_id >> 12) & 0xF]);
            print_char(hex[(dev->vendor_id >> 8) & 0xF]);
            print_char(hex[(dev->vendor_id >> 4) & 0xF]);
            print_char(hex[dev->vendor_id & 0xF]);
            print_string(" 0x");
            // Device hex
            print_char(hex[(dev->device_id >> 12) & 0xF]);
            print_char(hex[(dev->device_id >> 8) & 0xF]);
            print_char(hex[(dev->device_id >> 4) & 0xF]);
            print_char(hex[dev->device_id & 0xF]);
            print_string("  ");
            print_char(hex[(dev->class_code >> 4) & 0xF]);
            print_char(hex[dev->class_code & 0xF]);
            print_string("    ");
            print_char(hex[(dev->subclass >> 4) & 0xF]);
            print_char(hex[dev->subclass & 0xF]);
            print_string("   ");
            print_char('0' + (dev->irq_line / 10) % 10);
            print_char('0' + (dev->irq_line % 10));
            if (dev->vendor_id == PCI_VENDOR_VBOX && dev->device_id == PCI_DEVICE_VBOX_GUEST) {
                print_string(" [VirtualBox VMMDev]");
            } else if (dev->vendor_id == PCI_VENDOR_VBOX && dev->device_id == PCI_DEVICE_VBOX_VGA) {
                print_string(" [VirtualBox VGA]");
            }
            new_line();
        }
    } else if (str_equals(cmd, "vbox")) {
        print_line("VirtualBox Guest Additions Status:");
        if (vbox_guest_is_available()) {
            print_line("  Status:        CONNECTED (Device 0x80EE:0xCAFE)");
            print_line("  Pointer Mode:  Absolute Mouse Integration ACTIVE");
            print_string("  Shared Folders: ");
            if (vbox_shared_folders_is_available()) {
                print_line("ONLINE (Host HGCM Connected)");
            } else {
                print_line("NOT MOUNTED (No folders shared)");
            }
            uint64_t last_time = vbox_guest_get_last_sync_time();
            if (last_time > 0) {
                print_line("  Host Time Sync: UTC Heartbeat Synchronized");
            }
        } else {
            print_line("  Status: NOT CONNECTED (Running on QEMU / KVM / Bare-metal)");
            print_line("  Pointer Mode: PS/2 Relative Mouse Fallback Active");
        }
    } else if (str_starts_with(cmd, "res")) {
        const char* p = cmd + 3;
        while (*p == ' ') p++;
        if (*p == '\0') {
            print_line("Usage: res <width> <height> (e.g. res 1024 768 or res 1280 720)");
        } else {
            uint32_t w = 0, h = 0;
            while (*p >= '0' && *p <= '9') { w = w * 10 + (*p++ - '0'); }
            while (*p == ' ') p++;
            while (*p >= '0' && *p <= '9') { h = h * 10 + (*p++ - '0'); }
            if (w >= 640 && h >= 480) {
                if (vbe_set_resolution(w, h, 32)) {
                    print_line("Display resolution successfully changed.");
                } else {
                    print_line("Error: VBE dynamic video switching failed.");
                }
            } else {
                print_line("Error: Resolution minimum is 640x480.");
            }
        }
    } else if (str_equals(cmd, "poweroff") || str_equals(cmd, "shutdown")) {
        print_line("Shutting down Oxygen Low's Software cleanly via ACPI...");
        acpi_poweroff();
    } else if (str_equals(cmd, "reboot")) {
        print_line("Rebooting Oxygen Low's Software...");
        acpi_reboot();
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
    if (visible_rows <= 0) visible_rows = 22;

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
