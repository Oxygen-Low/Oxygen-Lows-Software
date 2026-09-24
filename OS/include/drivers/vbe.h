#ifndef OXYGEN_DRIVERS_VBE_H
#define OXYGEN_DRIVERS_VBE_H

#include "types.h"

// Bochs / VirtualBox VBE Dispi I/O Ports
#define VBE_DISPI_IOPORT_INDEX 0x01CE
#define VBE_DISPI_IOPORT_DATA  0x01CF

// VBE Dispi Register Indexes
#define VBE_DISPI_INDEX_ID          0x0
#define VBE_DISPI_INDEX_XRES        0x1
#define VBE_DISPI_INDEX_YRES        0x2
#define VBE_DISPI_INDEX_BPP         0x3
#define VBE_DISPI_INDEX_ENABLE      0x4
#define VBE_DISPI_INDEX_BANK        0x5
#define VBE_DISPI_INDEX_VIRT_WIDTH  0x6
#define VBE_DISPI_INDEX_VIRT_HEIGHT 0x7
#define VBE_DISPI_INDEX_X_OFFSET    0x8
#define VBE_DISPI_INDEX_Y_OFFSET    0x9

// VBE Dispi Interface Version IDs
#define VBE_DISPI_ID0 0xB0C0
#define VBE_DISPI_ID1 0xB0C1
#define VBE_DISPI_ID2 0xB0C2
#define VBE_DISPI_ID3 0xB0C3
#define VBE_DISPI_ID4 0xB0C4
#define VBE_DISPI_ID5 0xB0C5

// VBE Dispi Enable Register Flags
#define VBE_DISPI_DISABLED    0x00
#define VBE_DISPI_ENABLED     0x01
#define VBE_DISPI_GETCAPS     0x02
#define VBE_DISPI_8BIT_DAC    0x20
#define VBE_DISPI_LFB_ENABLED 0x40
#define VBE_DISPI_NOCLEARMEM  0x80

// Supported Color Depths
#define VBE_DISPI_BPP_4  0x04
#define VBE_DISPI_BPP_8  0x08
#define VBE_DISPI_BPP_15 0x0F
#define VBE_DISPI_BPP_16 0x10
#define VBE_DISPI_BPP_24 0x18
#define VBE_DISPI_BPP_32 0x20

#ifdef __cplusplus
extern "C" {
#endif

// Register access
void vbe_write(uint16_t index, uint16_t data);
uint16_t vbe_read(uint16_t index);

// Detection & Query
bool vbe_is_available(void);
uint16_t vbe_get_version(void);
void vbe_get_resolution(uint32_t* width, uint32_t* height, uint32_t* bpp);

// Dynamic Video Mode Switching (V03)
bool vbe_set_resolution(uint32_t width, uint32_t height, uint32_t bpp = 32, bool clear_mem = false);
bool vbe_set_bank(uint16_t bank);
void vbe_set_offset(uint16_t x_offset, uint16_t y_offset);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_VBE_H
