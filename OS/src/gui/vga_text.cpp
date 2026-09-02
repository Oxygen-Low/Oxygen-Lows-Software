#include "gui/vga_text.h"
#include "arch/x86_64/pit.h"
#include "arch/x86_64/io.h"
#include "mm/pmm.h"
#include "drivers/serial.h"

namespace {

#define VGA_WIDTH 80
#define VGA_HEIGHT 25
#define VGA_BUFFER_ADDR 0xB8000

volatile uint16_t* const g_vga_buffer = reinterpret_cast<volatile uint16_t*>(VGA_BUFFER_ADDR);
bool g_vga_active = false;

char g_cmd_buffer[64] = {};
size_t g_cmd_len = 0;
char g_output_lines[10][60] = {};
size_t g_output_count = 0;

inline uint16_t vga_entry(char c, uint8_t color) {
    return static_cast<uint16_t>(static_cast<uint8_t>(c)) | (static_cast<uint16_t>(color) << 8);
}

void append_output(const char* msg) {
    if (g_output_count < 10) {
        size_t idx = 0;
        while (msg[idx] && idx < 58) {
            g_output_lines[g_output_count][idx] = msg[idx];
            idx++;
        }
        g_output_lines[g_output_count][idx] = '\0';
        g_output_count++;
    } else {
        // Shift lines up
        for (size_t i = 0; i < 9; ++i) {
            for (size_t k = 0; k < 60; ++k) {
                g_output_lines[i][k] = g_output_lines[i + 1][k];
            }
        }
        size_t idx = 0;
        while (msg[idx] && idx < 58) {
            g_output_lines[9][idx] = msg[idx];
            idx++;
        }
        g_output_lines[9][idx] = '\0';
    }
}

void execute_command(const char* cmd) {
    if (cmd[0] == 'h' && cmd[1] == 'e' && cmd[2] == 'l' && cmd[3] == 'p') {
        append_output("Commands: help, sysinfo, uname, about, clear, reboot");
    } else if (cmd[0] == 's' && cmd[1] == 'y' && cmd[2] == 's') {
        append_output("OS: Oxygen Low's Software (x86_64)");
        append_output("Arch: AMD64 / Intel 64, Mode: Long Mode");
    } else if (cmd[0] == 'u' && cmd[1] == 'n' && cmd[2] == 'a') {
        append_output("Oxygen Low's Software 1.0.0-release (x86_64)");
    } else if (cmd[0] == 'a' && cmd[1] == 'b' && cmd[2] == 'o') {
        append_output("Oxygen Low's Software - Desktop OS");
    } else if (cmd[0] == 'c' && cmd[1] == 'l' && cmd[2] == 'e') {
        g_output_count = 0;
    } else if (cmd[0] == 'r' && cmd[1] == 'e' && cmd[2] == 'b') {
        append_output("Rebooting system...");
        outb(0x64, 0xFE);
    } else if (cmd[0] != '\0') {
        append_output("Unknown command. Type 'help' for available commands.");
    }
}

} // anonymous namespace

extern "C" {

void vga_text_init(void) {
    g_vga_active = true;
    g_cmd_len = 0;
    g_output_count = 0;

    append_output("Oxygen Low's Software — Interactive Shell");
    append_output("Kernel initialized. Type 'help' for commands.");

    vga_text_render_desktop();
    serial_printf("[VGA] Text-mode desktop fallback initialized at 0xB8000\n");
}

bool vga_text_is_active(void) {
    return g_vga_active;
}

void vga_text_clear(uint8_t attr) {
    for (int i = 0; i < VGA_WIDTH * VGA_HEIGHT; ++i) {
        g_vga_buffer[i] = vga_entry(' ', attr);
    }
}

void vga_text_write_string(int row, int col, const char* str, uint8_t attr) {
    if (row < 0 || row >= VGA_HEIGHT || col < 0 || col >= VGA_WIDTH) return;
    int pos = row * VGA_WIDTH + col;
    while (*str && col < VGA_WIDTH) {
        g_vga_buffer[pos++] = vga_entry(*str++, attr);
        col++;
    }
}

void vga_text_render_desktop(void) {
    if (!g_vga_active) return;

    // Desktop background (Navy Blue = 0x1F)
    for (int r = 1; r < 24; ++r) {
        for (int c = 0; c < VGA_WIDTH; ++c) {
            g_vga_buffer[r * VGA_WIDTH + c] = vga_entry(0xB0, 0x19); // Stippled pattern
        }
    }

    // Row 0: Top Menu Bar (White on Cyan/Blue = 0x3F)
    for (int c = 0; c < VGA_WIDTH; ++c) {
        g_vga_buffer[c] = vga_entry(' ', 0x3F);
    }
    vga_text_write_string(0, 2, " Oxygen Low's Software v1.0.0 (x86_64) ", 0x3E);
    vga_text_write_string(0, 52, " [File] [View] [Tools] [Help] ", 0x3F);

    // Terminal Window (Left side: rows 2..18, cols 2..48)
    // Title bar
    for (int c = 2; c <= 48; ++c) g_vga_buffer[2 * VGA_WIDTH + c] = vga_entry(' ', 0x70);
    vga_text_write_string(2, 4, "[#] Terminal - Oxygen Low's Software", 0x70);

    // Window body (Black background = 0x07)
    for (int r = 3; r <= 17; ++r) {
        for (int c = 2; c <= 48; ++c) {
            g_vga_buffer[r * VGA_WIDTH + c] = vga_entry(' ', 0x07);
        }
    }

    // Terminal output lines
    for (size_t i = 0; i < g_output_count && i < 11; ++i) {
        vga_text_write_string(3 + static_cast<int>(i), 4, g_output_lines[i], 0x0A);
    }

    // Shell Prompt
    char prompt_line[50] = "oxygen> ";
    size_t p_idx = 8;
    for (size_t k = 0; k < g_cmd_len && p_idx < 45; ++k) {
        prompt_line[p_idx++] = g_cmd_buffer[k];
    }
    prompt_line[p_idx++] = '_'; // Cursor
    prompt_line[p_idx] = '\0';
    vga_text_write_string(16, 4, prompt_line, 0x0F);

    // System Diagnostics Window (Right side: rows 2..18, cols 50..77)
    for (int c = 50; c <= 77; ++c) g_vga_buffer[2 * VGA_WIDTH + c] = vga_entry(' ', 0x70);
    vga_text_write_string(2, 52, "[i] System Monitor", 0x70);

    for (int r = 3; r <= 17; ++r) {
        for (int c = 50; c <= 77; ++c) {
            g_vga_buffer[r * VGA_WIDTH + c] = vga_entry(' ', 0x1E);
        }
    }

    vga_text_write_string(4, 52, "OS: Oxygen Low's Software", 0x1E);
    vga_text_write_string(5, 52, "Kernel: x86_64 Long Mode", 0x1F);
    vga_text_write_string(6, 52, "Display: VGA Text Fallback", 0x1B);
    vga_text_write_string(8, 52, "RAM Stats:", 0x1E);

    uint32_t total_mb = static_cast<uint32_t>(pmm_get_total_memory() / (1024 * 1024));
    uint32_t free_mb = static_cast<uint32_t>(pmm_get_free_memory() / (1024 * 1024));
    uint32_t used_mb = static_cast<uint32_t>(pmm_get_used_memory() / (1024 * 1024));

    char ram_str[30];
    // Simple integer to string formatting
    int offset = 0;
    ram_str[offset++] = ' ';
    ram_str[offset++] = ' ';
    ram_str[offset++] = 'T'; ram_str[offset++] = 'o'; ram_str[offset++] = 't'; ram_str[offset++] = 'a'; ram_str[offset++] = 'l';
    ram_str[offset++] = ':'; ram_str[offset++] = ' ';
    if (total_mb >= 100) ram_str[offset++] = '0' + (total_mb / 100) % 10;
    if (total_mb >= 10)  ram_str[offset++] = '0' + (total_mb / 10) % 10;
    ram_str[offset++] = '0' + (total_mb % 10);
    ram_str[offset++] = ' '; ram_str[offset++] = 'M'; ram_str[offset++] = 'B';
    ram_str[offset] = '\0';
    vga_text_write_string(9, 52, ram_str, 0x1F);

    offset = 0;
    ram_str[offset++] = ' '; ram_str[offset++] = ' ';
    ram_str[offset++] = 'F'; ram_str[offset++] = 'r'; ram_str[offset++] = 'e'; ram_str[offset++] = 'e';
    ram_str[offset++] = ':'; ram_str[offset++] = ' ';
    if (free_mb >= 100) ram_str[offset++] = '0' + (free_mb / 100) % 10;
    if (free_mb >= 10)  ram_str[offset++] = '0' + (free_mb / 10) % 10;
    ram_str[offset++] = '0' + (free_mb % 10);
    ram_str[offset++] = ' '; ram_str[offset++] = 'M'; ram_str[offset++] = 'B';
    ram_str[offset] = '\0';
    vga_text_write_string(10, 52, ram_str, 0x1A);

    offset = 0;
    ram_str[offset++] = ' '; ram_str[offset++] = ' ';
    ram_str[offset++] = 'U'; ram_str[offset++] = 's'; ram_str[offset++] = 'e'; ram_str[offset++] = 'd';
    ram_str[offset++] = ':'; ram_str[offset++] = ' ';
    if (used_mb >= 100) ram_str[offset++] = '0' + (used_mb / 100) % 10;
    if (used_mb >= 10)  ram_str[offset++] = '0' + (used_mb / 10) % 10;
    ram_str[offset++] = '0' + (used_mb % 10);
    ram_str[offset++] = ' '; ram_str[offset++] = 'M'; ram_str[offset++] = 'B';
    ram_str[offset] = '\0';
    vga_text_write_string(11, 52, ram_str, 0x1C);

    vga_text_write_string(13, 52, "Built-in Apps Ready:", 0x1E);
    vga_text_write_string(14, 52, " [1] Terminal Shell", 0x1F);
    vga_text_write_string(15, 52, " [2] System Monitor", 0x1F);
    vga_text_write_string(16, 52, " [3] Calculator / Math", 0x1F);

    // Row 24: Bottom Taskbar (Black on Light Gray = 0x70)
    for (int c = 0; c < VGA_WIDTH; ++c) {
        g_vga_buffer[24 * VGA_WIDTH + c] = vga_entry(' ', 0x70);
    }
    vga_text_write_string(24, 2, "[ Start ]", 0x71);
    vga_text_write_string(24, 13, "[Terminal]", 0x70);
    vga_text_write_string(24, 25, "[SysInfo]", 0x70);
    vga_text_write_string(24, 36, "[Notepad]", 0x70);
    vga_text_write_string(24, 47, "[Calc]", 0x70);
    vga_text_write_string(24, 55, "[Explorer]", 0x70);

    // Digital clock on taskbar
    uint64_t uptime_s = pit_get_uptime_ms() / 1000;
    uint32_t hrs = static_cast<uint32_t>((uptime_s / 3600) % 24);
    uint32_t mins = static_cast<uint32_t>((uptime_s / 60) % 60);
    uint32_t secs = static_cast<uint32_t>(uptime_s % 60);

    char clock_str[10];
    clock_str[0] = '0' + (hrs / 10);
    clock_str[1] = '0' + (hrs % 10);
    clock_str[2] = ':';
    clock_str[3] = '0' + (mins / 10);
    clock_str[4] = '0' + (mins % 10);
    clock_str[5] = ':';
    clock_str[6] = '0' + (secs / 10);
    clock_str[7] = '0' + (secs % 10);
    clock_str[8] = '\0';
    vga_text_write_string(24, 69, clock_str, 0x70);
}

void vga_text_handle_key(uint8_t scancode, char ascii) {
    UNUSED(scancode);
    if (!g_vga_active) return;

    if (ascii == '\n' || ascii == '\r') {
        g_cmd_buffer[g_cmd_len] = '\0';
        char echo[70] = "oxygen> ";
        size_t idx = 8;
        for (size_t i = 0; i < g_cmd_len; ++i) echo[idx++] = g_cmd_buffer[i];
        echo[idx] = '\0';
        append_output(echo);

        execute_command(g_cmd_buffer);
        g_cmd_len = 0;
        vga_text_render_desktop();
    } else if (ascii == '\b') {
        if (g_cmd_len > 0) {
            g_cmd_len--;
            vga_text_render_desktop();
        }
    } else if (ascii >= 32 && ascii <= 126) {
        if (g_cmd_len < sizeof(g_cmd_buffer) - 2) {
            g_cmd_buffer[g_cmd_len++] = ascii;
            vga_text_render_desktop();
        }
    }
}

} // extern "C"
