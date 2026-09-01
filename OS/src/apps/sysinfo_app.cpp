#include "apps/sysinfo_app.h"
#include "gui/font.h"
#include "gui/window.h"
#include "gui/framebuffer.h"
#include "mm/pmm.h"
#include "mm/heap.h"
#include "arch/x86_64/pit.h"

SysInfoApp::SysInfoApp() : m_window(nullptr), m_last_refresh_ms(0) {}
SysInfoApp::~SysInfoApp() {}

void SysInfoApp::on_init(Window* window) {
    m_window = window;
    m_last_refresh_ms = pit_get_uptime_ms();
}

void SysInfoApp::on_update(void) {
    uint64_t now = pit_get_uptime_ms();
    if (now - m_last_refresh_ms >= 500) {
        m_last_refresh_ms = now;
        if (m_window) m_window->is_dirty = true;
    }
}

void SysInfoApp::on_paint(const Rect& client_area) {
    // Fill client background
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, Color(15, 23, 42, 255));

    int32_t x = client_area.x + 16;
    int32_t y = client_area.y + 14;

    // 1. Branding Header Card
    gfx_fill_rounded_rect(x, y, client_area.width - 32, 58, 4, Color(28, 37, 65, 255));
    gfx_draw_rounded_rect(x, y, client_area.width - 32, 58, 4, Color(8, 131, 149, 255));

    font_draw_string(x + 12, y + 10, "Oxygen Low's Software", COLOR_WHITE);
    font_draw_string(x + 12, y + 28, "64-bit Bare-Metal Operating System (Freestanding C++)", Color(0, 229, 255, 255));
    font_draw_string(x + 12, y + 42, "Target Architecture: x86_64 Long Mode", Color(148, 163, 184, 255));

    y += 70;

    // 2. System Metrics & Diagnostics
    font_draw_string(x, y, "HARDWARE & KERNEL STATUS", Color(8, 131, 149, 255));
    gfx_fill_rect(x, y + 18, client_area.width - 32, 1, Color(51, 65, 85, 255));
    y += 26;

    font_draw_string(x + 8, y, "Kernel Architecture : x86_64 AMD64 Long Mode (CR0.PG, CR4.PAE)", COLOR_WHITE);
    y += 18;
    font_draw_string(x + 8, y, "Interrupt Routing   : 8259 PIC Remapped (Vectors 32-47), IDT 256 Gates", COLOR_WHITE);
    y += 18;
    font_draw_string(x + 8, y, "System Timer        : 8254 PIT Channel 0 @ 1000Hz (1ms Tick)", COLOR_WHITE);
    y += 18;
    font_draw_string(x + 8, y, "Display Video Mode  : 1024x768 @ 32bpp Direct RGB Linear Framebuffer", COLOR_WHITE);
    y += 28;

    // 3. Physical Memory Usage & Visual Bar
    size_t total_bytes = pmm_get_total_memory();
    size_t used_bytes  = pmm_get_used_memory();
    size_t free_bytes  = pmm_get_free_memory();
    size_t heap_used   = heap_get_used_bytes();

    size_t total_mb = total_bytes / (1024 * 1024);
    size_t used_mb  = used_bytes / (1024 * 1024);
    size_t free_mb  = free_bytes / (1024 * 1024);
    size_t heap_kb  = heap_used / 1024;

    font_draw_string(x, y, "MEMORY ALLOCATION & DIAGNOSTICS", Color(8, 131, 149, 255));
    gfx_fill_rect(x, y + 18, client_area.width - 32, 1, Color(51, 65, 85, 255));
    y += 26;

    // Visual Progress Bar
    int32_t bar_w = client_area.width - 48;
    int32_t bar_h = 18;
    gfx_fill_rounded_rect(x + 8, y, bar_w, bar_h, 3, Color(51, 65, 85, 255)); // Gray Free

    int32_t used_bar_w = total_bytes > 0 ? static_cast<int32_t>((used_bytes * bar_w) / total_bytes) : 0;
    if (used_bar_w > bar_w) used_bar_w = bar_w;
    if (used_bar_w < 4 && used_bytes > 0) used_bar_w = 4;

    gfx_fill_rounded_rect(x + 8, y, used_bar_w, bar_h, 3, Color(0, 180, 216, 255)); // Cyan Used
    gfx_draw_rounded_rect(x + 8, y, bar_w, bar_h, 3, Color(8, 131, 149, 255));

    y += 26;
    font_printf(x + 8, y, COLOR_WHITE, COLOR_TRANSPARENT,
                "Total RAM: %u MB | Used: %u MB | Free: %u MB",
                static_cast<unsigned int>(total_mb),
                static_cast<unsigned int>(used_mb),
                static_cast<unsigned int>(free_mb));
    y += 18;
    font_printf(x + 8, y, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                "Kernel Heap Usage: %u KB (Dynamic boundary-tag allocator)",
                static_cast<unsigned int>(heap_kb));

    y += 28;

    // 4. Uptime & Telemetry
    uint64_t uptime_sec = pit_get_uptime_ms() / 1000;
    uint32_t hr = static_cast<uint32_t>(uptime_sec / 3600);
    uint32_t mn = static_cast<uint32_t>((uptime_sec / 60) % 60);
    uint32_t sc = static_cast<uint32_t>(uptime_sec % 60);

    font_printf(x + 8, y, Color(0, 229, 255, 255), COLOR_TRANSPARENT,
                "System Uptime: %02uh %02um %02us | VFS: RamFS Mounted at /",
                hr, mn, sc);
}
