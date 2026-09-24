#include "gui/framebuffer.h"
#include "gui/vga_text.h"
#include "mm/heap.h"
#include "mm/vmm.h"
#include "drivers/serial.h"

static FramebufferConfig g_fb_config = {};

bool fb_init(uint64_t multiboot_info_addr) {
    if (multiboot_info_addr == 0) {
        serial_printf("[FB] Error: Multiboot2 info address is null\n");
        vga_text_init();
        return false;
    }

    // Default configuration (safe fallback)
    g_fb_config.phys_addr = 0;
    g_fb_config.width = 0;
    g_fb_config.height = 0;
    g_fb_config.pitch = 0;
    g_fb_config.bpp = 0;
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
            serial_printf("[FB] Multiboot2 framebuffer tag: type=%u, %ux%u @ %ubpp, addr=0x%p, pitch=%u\n",
                          fb_tag->framebuffer_type,
                          fb_tag->framebuffer_width, fb_tag->framebuffer_height,
                          fb_tag->framebuffer_bpp,
                          reinterpret_cast<void*>((uintptr_t)fb_tag->framebuffer_addr),
                          fb_tag->framebuffer_pitch);

            // Accept type 0 (indexed) and type 1 (RGB), reject type 2 (EGA text)
            if (fb_tag->framebuffer_width > 0 && fb_tag->framebuffer_height > 0 &&
                fb_tag->framebuffer_type != MULTIBOOT2_FRAMEBUFFER_TYPE_EGA_TEXT) {
                g_fb_config.phys_addr = fb_tag->framebuffer_addr;
                g_fb_config.pitch = fb_tag->framebuffer_pitch;
                g_fb_config.width = fb_tag->framebuffer_width;
                g_fb_config.height = fb_tag->framebuffer_height;
                g_fb_config.bpp = fb_tag->framebuffer_bpp;
                if (fb_tag->framebuffer_type == MULTIBOOT2_FRAMEBUFFER_TYPE_RGB) {
                    g_fb_config.red_pos = fb_tag->framebuffer_red_field_position;
                    g_fb_config.red_size = fb_tag->framebuffer_red_mask_size;
                    g_fb_config.green_pos = fb_tag->framebuffer_green_field_position;
                    g_fb_config.green_size = fb_tag->framebuffer_green_mask_size;
                    g_fb_config.blue_pos = fb_tag->framebuffer_blue_field_position;
                    g_fb_config.blue_size = fb_tag->framebuffer_blue_mask_size;
                }
                found_fb_tag = true;
            } else {
                serial_printf("[FB] Multiboot provided EGA text mode or unhandled mode type=%u\n",
                              fb_tag->framebuffer_type);
            }
            break;
        }

        current_addr = ALIGN_UP(current_addr + tag->size, 8);
    }

    if (!found_fb_tag || g_fb_config.phys_addr == 0) {
        serial_printf("[FB] Linear framebuffer not provided by bootloader. Activating VGA Text Mode console.\n");
        vga_text_init();
        return false;
    }

    serial_printf("[FB] Using framebuffer: %ux%u @ %ubpp (pitch=%u, addr=0x%p)\n",
                  g_fb_config.width, g_fb_config.height, g_fb_config.bpp,
                  g_fb_config.pitch, reinterpret_cast<void*>(g_fb_config.phys_addr));

    g_fb_config.virt_addr = reinterpret_cast<uint32_t*>(g_fb_config.phys_addr);

    // Map physical framebuffer pages with PAT Write-Combining (or PCD fallback)
    uint64_t vram_flags = PAGE_PRESENT | PAGE_WRITABLE | (vmm_has_pat() ? PAGE_WRITE_COMBINING : PAGE_CACHE_DISABLE);
    size_t fb_total_bytes = static_cast<size_t>(g_fb_config.pitch) * g_fb_config.height;
    for (size_t offset = 0; offset < fb_total_bytes; offset += 4096) {
        vmm_map_page(
            g_fb_config.phys_addr + offset,
            g_fb_config.phys_addr + offset,
            vram_flags
        );
    }

    // Allocate backbuffer for double-buffering
    size_t backbuffer_bytes = static_cast<size_t>(g_fb_config.width) * g_fb_config.height * sizeof(uint32_t);
    g_fb_config.backbuffer = reinterpret_cast<uint32_t*>(kmalloc(backbuffer_bytes));

    if (!g_fb_config.backbuffer) {
        serial_printf("[FB] Warning: Could not allocate backbuffer, using direct VRAM\n");
        g_fb_config.backbuffer = g_fb_config.virt_addr;
    } else {
        // Clear backbuffer
        for (size_t i = 0; i < static_cast<size_t>(g_fb_config.width) * g_fb_config.height; ++i) {
            g_fb_config.backbuffer[i] = 0xFF000000;
        }
    }

    g_fb_config.is_initialized = true;
    serial_printf("[FB] Framebuffer fully initialized\n");

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

// P02: SIMD (SSE2) Non-Temporal Streaming Stores for Framebuffer Swaps
// Bypasses CPU cache hierarchy directly into VRAM write-combining buffers
static inline void sse2_streaming_store_row(uint32_t* dst, const uint32_t* src, size_t count) {
    size_t i = 0;

    // 1. Align dst to 16-byte boundary using scalar stores (movntdq requires 16-byte alignment)
    while (i < count && (reinterpret_cast<uintptr_t>(dst + i) & 0x0F) != 0) {
        dst[i] = src[i];
        i++;
    }

    // 2. Process 64-byte chunks (16 pixels) with 4 x 128-bit streaming stores
    for (; i + 16 <= count; i += 16) {
        __asm__ volatile (
            "movdqu 0(%1), %%xmm0\n\t"
            "movdqu 16(%1), %%xmm1\n\t"
            "movdqu 32(%1), %%xmm2\n\t"
            "movdqu 48(%1), %%xmm3\n\t"
            "movntdq %%xmm0, 0(%0)\n\t"
            "movntdq %%xmm1, 16(%0)\n\t"
            "movntdq %%xmm2, 32(%0)\n\t"
            "movntdq %%xmm3, 48(%0)\n\t"
            :
            : "r"(dst + i), "r"(src + i)
            : "memory", "xmm0", "xmm1", "xmm2", "xmm3"
        );
    }
    // 3. Process 16-byte chunks (4 pixels) with 1 x 128-bit streaming store
    for (; i + 4 <= count; i += 4) {
        __asm__ volatile (
            "movdqu 0(%1), %%xmm0\n\t"
            "movntdq %%xmm0, 0(%0)\n\t"
            :
            : "r"(dst + i), "r"(src + i)
            : "memory", "xmm0"
        );
    }
    // 4. Scalar tail pixels
    for (; i < count; ++i) {
        dst[i] = src[i];
    }
}

// P01: Dirty-Region Tracking State
static struct {
    int32_t x1, y1, x2, y2;
    bool is_dirty;
} g_fb_dirty = {0, 0, 0, 0, false};

void fb_mark_dirty(int32_t x, int32_t y, int32_t w, int32_t h) {
    if (w <= 0 || h <= 0) return;
    int32_t right = x + w;
    int32_t bottom = y + h;

    if (!g_fb_dirty.is_dirty) {
        g_fb_dirty.x1 = x;
        g_fb_dirty.y1 = y;
        g_fb_dirty.x2 = right;
        g_fb_dirty.y2 = bottom;
        g_fb_dirty.is_dirty = true;
    } else {
        if (x < g_fb_dirty.x1) g_fb_dirty.x1 = x;
        if (y < g_fb_dirty.y1) g_fb_dirty.y1 = y;
        if (right > g_fb_dirty.x2) g_fb_dirty.x2 = right;
        if (bottom > g_fb_dirty.y2) g_fb_dirty.y2 = bottom;
    }
}

void fb_mark_dirty_all(void) {
    g_fb_dirty.x1 = 0;
    g_fb_dirty.y1 = 0;
    g_fb_dirty.x2 = static_cast<int32_t>(g_fb_config.width);
    g_fb_dirty.y2 = static_cast<int32_t>(g_fb_config.height);
    g_fb_dirty.is_dirty = true;
}

bool fb_is_dirty(void) {
    return g_fb_dirty.is_dirty;
}

void fb_clear_dirty(void) {
    g_fb_dirty.is_dirty = false;
    g_fb_dirty.x1 = 0;
    g_fb_dirty.y1 = 0;
    g_fb_dirty.x2 = 0;
    g_fb_dirty.y2 = 0;
}

void fb_present_dirty(void) {
    if (!g_fb_dirty.is_dirty) return;

    int32_t x = g_fb_dirty.x1;
    int32_t y = g_fb_dirty.y1;
    int32_t w = g_fb_dirty.x2 - g_fb_dirty.x1;
    int32_t h = g_fb_dirty.y2 - g_fb_dirty.y1;

    fb_clear_dirty();

    if (w >= static_cast<int32_t>(g_fb_config.width) && h >= static_cast<int32_t>(g_fb_config.height)) {
        fb_swap_buffers();
    } else {
        fb_swap_rect(x, y, w, h);
    }
}

void fb_swap_buffers(void) {
    if (!g_fb_config.is_initialized || !g_fb_config.backbuffer || !g_fb_config.virt_addr) return;
    if (g_fb_config.backbuffer == g_fb_config.virt_addr) return;

    size_t pixels_per_row = g_fb_config.width;
    uint8_t* vram_base = reinterpret_cast<uint8_t*>(g_fb_config.virt_addr);
    size_t pitch = g_fb_config.pitch;
    uint8_t bytes_per_pixel = g_fb_config.bpp / 8;
    if (bytes_per_pixel == 0) bytes_per_pixel = 4;

    if (bytes_per_pixel == 4) {
        for (uint32_t y = 0; y < g_fb_config.height; ++y) {
            const uint32_t* src_row = &g_fb_config.backbuffer[y * pixels_per_row];
            uint32_t* dst_row = reinterpret_cast<uint32_t*>(vram_base + y * pitch);
            sse2_streaming_store_row(dst_row, src_row, pixels_per_row);
        }
        __asm__ volatile ("sfence" ::: "memory");
    } else if (bytes_per_pixel == 3) {
        for (uint32_t y = 0; y < g_fb_config.height; ++y) {
            const uint32_t* src_row = &g_fb_config.backbuffer[y * pixels_per_row];
            uint8_t* dst_row = vram_base + y * pitch;
            for (size_t x = 0; x < pixels_per_row; ++x) {
                uint32_t pixel = src_row[x];
                dst_row[x * 3 + 0] = pixel & 0xFF;
                dst_row[x * 3 + 1] = (pixel >> 8) & 0xFF;
                dst_row[x * 3 + 2] = (pixel >> 16) & 0xFF;
            }
        }
        __asm__ volatile ("mfence" ::: "memory");
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
    uint8_t* vram_base = reinterpret_cast<uint8_t*>(g_fb_config.virt_addr);
    size_t pitch = g_fb_config.pitch;
    uint8_t bytes_per_pixel = g_fb_config.bpp / 8;
    if (bytes_per_pixel == 0) bytes_per_pixel = 4;

    if (bytes_per_pixel == 4) {
        for (int32_t row = y; row < y + h; ++row) {
            const uint32_t* src = &g_fb_config.backbuffer[row * pixels_per_row + x];
            uint32_t* dst = reinterpret_cast<uint32_t*>(vram_base + row * pitch) + x;
            sse2_streaming_store_row(dst, src, static_cast<size_t>(w));
        }
        __asm__ volatile ("sfence" ::: "memory");
    } else if (bytes_per_pixel == 3) {
        for (int32_t row = y; row < y + h; ++row) {
            const uint32_t* src = &g_fb_config.backbuffer[row * pixels_per_row + x];
            uint8_t* dst = vram_base + row * pitch + x * 3;
            for (int32_t col = 0; col < w; ++col) {
                uint32_t pixel = src[col];
                dst[col * 3 + 0] = pixel & 0xFF;
                dst[col * 3 + 1] = (pixel >> 8) & 0xFF;
                dst[col * 3 + 2] = (pixel >> 16) & 0xFF;
            }
        }
        __asm__ volatile ("mfence" ::: "memory");
    }
}
