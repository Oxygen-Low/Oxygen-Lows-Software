#include "drivers/vbe.h"
#include "arch/x86_64/io.h"
#include "gui/framebuffer.h"
#include "drivers/mouse.h"
#include "drivers/serial.h"

namespace {

bool g_vbe_probed = false;
bool g_vbe_available = false;
uint16_t g_vbe_version = 0;

} // anonymous namespace

extern "C" {

void vbe_write(uint16_t index, uint16_t data) {
    outw(VBE_DISPI_IOPORT_INDEX, index);
    outw(VBE_DISPI_IOPORT_DATA, data);
}

uint16_t vbe_read(uint16_t index) {
    outw(VBE_DISPI_IOPORT_INDEX, index);
    return inw(VBE_DISPI_IOPORT_DATA);
}

bool vbe_is_available(void) {
    if (g_vbe_probed) {
        return g_vbe_available;
    }

    g_vbe_probed = true;
    
    // Probe by writing ID4 and reading back supported ID
    vbe_write(VBE_DISPI_INDEX_ID, VBE_DISPI_ID4);
    uint16_t id = vbe_read(VBE_DISPI_INDEX_ID);

    if (id >= VBE_DISPI_ID0 && id <= VBE_DISPI_ID5) {
        g_vbe_available = true;
        g_vbe_version = id;
        serial_printf("[VBE] Bochs/VirtualBox VBE Dispi adapter detected (Version 0x%04x)\n", id);
    } else {
        g_vbe_available = false;
        g_vbe_version = 0;
        serial_printf("[VBE] Bochs/VirtualBox VBE Dispi adapter not available\n");
    }

    return g_vbe_available;
}

uint16_t vbe_get_version(void) {
    if (!g_vbe_probed) {
        vbe_is_available();
    }
    return g_vbe_version;
}

void vbe_get_resolution(uint32_t* width, uint32_t* height, uint32_t* bpp) {
    if (!vbe_is_available()) {
        if (width)  *width = 0;
        if (height) *height = 0;
        if (bpp)    *bpp = 0;
        return;
    }

    if (width)  *width = vbe_read(VBE_DISPI_INDEX_XRES);
    if (height) *height = vbe_read(VBE_DISPI_INDEX_YRES);
    if (bpp)    *bpp = vbe_read(VBE_DISPI_INDEX_BPP);
}

bool vbe_set_resolution(uint32_t width, uint32_t height, uint32_t bpp, bool clear_mem) {
    if (!vbe_is_available()) {
        serial_printf("[VBE] Cannot set resolution: VBE Dispi not available\n");
        return false;
    }

    if (width == 0 || height == 0 || (bpp != 16 && bpp != 24 && bpp != 32)) {
        serial_printf("[VBE] Invalid resolution requested: %ux%u @ %ubpp\n", width, height, bpp);
        return false;
    }

    serial_printf("[VBE] Switching resolution to %ux%u @ %ubpp...\n", width, height, bpp);

    // 1. Disable VBE adapter during reconfiguration
    vbe_write(VBE_DISPI_INDEX_ENABLE, VBE_DISPI_DISABLED);

    // 2. Configure video geometry and color depth
    vbe_write(VBE_DISPI_INDEX_XRES, (uint16_t)width);
    vbe_write(VBE_DISPI_INDEX_YRES, (uint16_t)height);
    vbe_write(VBE_DISPI_INDEX_BPP, (uint16_t)bpp);

    // 3. Enable linear framebuffer with optional memory preservation
    uint16_t enable_flags = VBE_DISPI_ENABLED | VBE_DISPI_LFB_ENABLED;
    if (!clear_mem) {
        enable_flags |= VBE_DISPI_NOCLEARMEM;
    }
    vbe_write(VBE_DISPI_INDEX_ENABLE, enable_flags);

    // 4. Update kernel framebuffer configuration
    FramebufferConfig* cfg = fb_get_config();
    if (cfg && cfg->is_initialized) {
        cfg->width = width;
        cfg->height = height;
        cfg->bpp = (uint8_t)bpp;
        cfg->pitch = width * (bpp / 8);

        // Update mouse coordinate bounds to new resolution
        mouse_set_bounds(width, height);
    }

    serial_printf("[VBE] Resolution set successfully: %ux%u @ %ubpp\n", width, height, bpp);
    return true;
}

bool vbe_set_bank(uint16_t bank) {
    if (!vbe_is_available()) return false;
    vbe_write(VBE_DISPI_INDEX_BANK, bank);
    return true;
}

void vbe_set_offset(uint16_t x_offset, uint16_t y_offset) {
    if (!vbe_is_available()) return;
    vbe_write(VBE_DISPI_INDEX_X_OFFSET, x_offset);
    vbe_write(VBE_DISPI_INDEX_Y_OFFSET, y_offset);
}

} // extern "C"
