#ifndef OXYGEN_GUI_FRAMEBUFFER_H
#define OXYGEN_GUI_FRAMEBUFFER_H

#include "types.h"
#include "boot/multiboot2.h"

struct FramebufferConfig {
    uint64_t phys_addr;
    uint32_t* virt_addr;      // Virtual address mapped in kernel paging
    uint32_t* backbuffer;     // Heap-allocated double buffer
    uint32_t  width;          // Screen width in pixels (e.g. 1024)
    uint32_t  height;         // Screen height in pixels (e.g. 768)
    uint32_t  pitch;          // Scanline width in bytes (e.g. 4096)
    uint8_t   bpp;            // Bits per pixel (32)
    uint8_t   red_pos, red_size;
    uint8_t   green_pos, green_size;
    uint8_t   blue_pos, blue_size;
    bool      is_initialized;
};

#ifdef __cplusplus
extern "C" {
#endif

bool               fb_init(uint64_t multiboot_info_addr);
FramebufferConfig* fb_get_config(void);
uint32_t           fb_get_width(void);
uint32_t           fb_get_height(void);
uint32_t           fb_get_pitch(void);
uint8_t            fb_get_bpp(void);
uint32_t*          fb_get_backbuffer(void);
uint32_t*          fb_get_frontbuffer(void);
void               fb_swap_buffers(void);
void               fb_swap_rect(int32_t x, int32_t y, int32_t w, int32_t h);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_FRAMEBUFFER_H
