#include "gui/framebuffer.h"
#include "mm/heap.h"
#include "mm/vmm.h"
#include "drivers/serial.h"

static FramebufferConfig g_fb_config = {0};

bool fb_init(uint64_t multiboot_info_addr) {
    if (multiboot_info_addr == 0) {
        serial_printf("[FB] Error: Multiboot2 info address is null\n");
        return false;
    }

    // Default configuration (safe fallback)
    g_fb_config.phys_addr = 0xFD000000;
    g_fb_config.width = 1024;
    g_fb_config.height = 768;
    g_fb_config.pitch = 1024 * 4;
    g_fb_config.bpp = 32;
    g_fb_config.red_pos = 16;
    g_fb_config.red_size = 8;
    g_fb_config.green_pos = 8;
    g_fb_config.green_size = 8;
    g_fb_config.blue_pos = 0;
    g_fb_config.blue_size = 8;
    g_fb_config.is_initialized = false;

    // Multiboot2 Info structure: total_size (4 bytes) + reserved (4 bytes), followed by tags
    auto* info = reinterpret_cast<const Multiboot2Info*>(multiboot_info_addr);
    uint32_t total_size = info->total_size;

    uintptr_t current_addr = multiboot_info_addr + sizeof(Multiboot2Info);
    uintptr_t end_addr = multiboot_info_addr + total_size;

    bool found_fb_tag = false;

    while (current_addr < end_addr) {
        auto* tag = reinterpret_cast<const Multiboot2Tag*>(current_addr);
        if (tag->type == MULTIBOOT2_TAG_TYPE_END || tag->size == 0) {
            break;
        }

        if (tag->type == MULTIBOOT2_TAG_TYPE_FRAMEBUFFER) {
            auto* fb_tag = reinterpret_cast<const Multiboot2FramebufferTag*>(tag);
            if (fb_tag->framebuffer_width > 0 && fb_tag->framebuffer_height > 0) {
                g_fb_config.phys_addr = fb_tag->framebuffer_addr;
                g_fb_config.pitch = fb_tag->framebuffer_pitch;
                g_fb_config.width = fb_tag->framebuffer_width;
                g_fb_config.height = fb_tag->framebuffer_height;
                g_fb_config.bpp = fb_tag->framebuffer_bpp;
                g_fb_config.red_pos = fb_tag->framebuffer_red_field_position;
                g_fb_config.red_size = fb_tag->framebuffer_red_mask_size;
                g_fb_config.green_pos = fb_tag->framebuffer_green_field_position;
                g_fb_config.green_size = fb_tag->framebuffer_green_mask_size;
                g_fb_config.blue_pos = fb_tag->framebuffer_blue_field_position;
                g_fb_config.blue_size = fb_tag->framebuffer_blue_mask_size;
                found_fb_tag = true;
            }
            break;
        }

        current_addr = ALIGN_UP(current_addr + tag->size, 8);
    }

    g_fb_config.virt_addr = reinterpret_cast<uint32_t*>(g_fb_config.phys_addr);

    // Map physical framebuffer in VMM
    size_t fb_total_bytes = static_cast<size_t>(g_fb_config.pitch) * g_fb_config.height;
    for (size_t offset = 0; offset < fb_total_bytes; offset += 4096) {
        vmm_map_page(
            g_fb_config.phys_addr + offset,
            g_fb_config.phys_addr + offset,
            PAGE_PRESENT | PAGE_WRITABLE
        );
    }

    // Allocate backbuffer for double-buffering
    size_t backbuffer_bytes = static_cast<size_t>(g_fb_config.width) * g_fb_config.height * sizeof(uint32_t);
    g_fb_config.backbuffer = reinterpret_cast<uint32_t*>(kmalloc(backbuffer_bytes));

    if (!g_fb_config.backbuffer) {
        serial_printf("[FB] Warning: Could not allocate backbuffer from heap, using direct VRAM\n");
        g_fb_config.backbuffer = g_fb_config.virt_addr;
    } else {
        // Clear backbuffer to pure black
        for (size_t i = 0; i < static_cast<size_t>(g_fb_config.width) * g_fb_config.height; ++i) {
            g_fb_config.backbuffer[i] = 0xFF000000;
        }
    }

    g_fb_config.is_initialized = true;

    serial_printf("[FB] Framebuffer initialized: %ux%u @ %ubpp (pitch=%u, addr=0x%p, tag=%s)\n",
                  g_fb_config.width, g_fb_config.height, g_fb_config.bpp,
                  g_fb_config.pitch, reinterpret_cast<void*>(g_fb_config.phys_addr),
                  found_fb_tag ? "parsed" : "fallback");

    return true;
}

FramebufferConfig* fb_get_config(void) {
    return &g_fb_config;
}

uint32_t fb_get_width(void) {
    return g_fb_config.width;
}

uint32_t fb_get_height(void) {
    return g_fb_config.height;
}

uint32_t fb_get_pitch(void) {
    return g_fb_config.pitch;
}

uint8_t fb_get_bpp(void) {
    return g_fb_config.bpp;
}

uint32_t* fb_get_backbuffer(void) {
    return g_fb_config.backbuffer ? g_fb_config.backbuffer : g_fb_config.virt_addr;
}

uint32_t* fb_get_frontbuffer(void) {
    return g_fb_config.virt_addr;
}

void fb_swap_buffers(void) {
    if (!g_fb_config.is_initialized || !g_fb_config.backbuffer || !g_fb_config.virt_addr) return;
    if (g_fb_config.backbuffer == g_fb_config.virt_addr) return;

    size_t pixels_per_row = g_fb_config.width;
    size_t vram_pitch_pixels = g_fb_config.pitch / sizeof(uint32_t);

    for (uint32_t y = 0; y < g_fb_config.height; ++y) {
        const uint32_t* src_row = &g_fb_config.backbuffer[y * pixels_per_row];
        uint32_t* dst_row = &g_fb_config.virt_addr[y * vram_pitch_pixels];
        for (size_t x = 0; x < pixels_per_row; ++x) {
            dst_row[x] = src_row[x];
        }
    }
}

void fb_swap_rect(int32_t x, int32_t y, int32_t w, int32_t h) {
    if (!g_fb_config.is_initialized || !g_fb_config.backbuffer || !g_fb_config.virt_addr) return;
    if (g_fb_config.backbuffer == g_fb_config.virt_addr) return;

    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > static_cast<int32_t>(g_fb_config.width)) w = g_fb_config.width - x;
    if (y + h > static_cast<int32_t>(g_fb_config.height)) h = g_fb_config.height - y;
    if (w <= 0 || h <= 0) return;

    size_t pixels_per_row = g_fb_config.width;
    size_t vram_pitch_pixels = g_fb_config.pitch / sizeof(uint32_t);

    for (int32_t row = y; row < y + h; ++row) {
        const uint32_t* src = &g_fb_config.backbuffer[row * pixels_per_row + x];
        uint32_t* dst = &g_fb_config.virt_addr[row * vram_pitch_pixels + x];
        for (int32_t col = 0; col < w; ++col) {
            dst[col] = src[col];
        }
    }
}
