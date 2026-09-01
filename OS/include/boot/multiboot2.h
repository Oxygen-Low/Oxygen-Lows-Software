#ifndef OXYGEN_MULTIBOOT2_H
#define OXYGEN_MULTIBOOT2_H

#include "types.h"

// Multiboot2 Magic Constants
#define MULTIBOOT2_HEADER_MAGIC             0xE85250D6
#define MULTIBOOT2_BOOTLOADER_MAGIC        0x36D76289
#define MULTIBOOT2_ARCHITECTURE_I386        0

// Multiboot2 Header Tag Types
#define MULTIBOOT2_HEADER_TAG_END                0
#define MULTIBOOT2_HEADER_TAG_INFORMATION_REQUEST 1
#define MULTIBOOT2_HEADER_TAG_ADDRESS            2
#define MULTIBOOT2_HEADER_TAG_ENTRY_ADDRESS      3
#define MULTIBOOT2_HEADER_TAG_CONSOLE_FLAGS      4
#define MULTIBOOT2_HEADER_TAG_FRAMEBUFFER        5
#define MULTIBOOT2_HEADER_TAG_MODULE_ALIGN       6
#define MULTIBOOT2_HEADER_TAG_EFI_BOOT_SERVICES  7
#define MULTIBOOT2_HEADER_TAG_ENTRY_ADDRESS_EFI64 9

// Multiboot2 Information Tag Types (Kernel reception)
#define MULTIBOOT2_TAG_TYPE_END               0
#define MULTIBOOT2_TAG_TYPE_CMDLINE           1
#define MULTIBOOT2_TAG_TYPE_BOOT_LOADER_NAME  2
#define MULTIBOOT2_TAG_TYPE_MODULE            3
#define MULTIBOOT2_TAG_TYPE_BASIC_MEMINFO     4
#define MULTIBOOT2_TAG_TYPE_BOOTDEV           5
#define MULTIBOOT2_TAG_TYPE_MMAP              6
#define MULTIBOOT2_TAG_TYPE_VBE               7
#define MULTIBOOT2_TAG_TYPE_FRAMEBUFFER       8
#define MULTIBOOT2_TAG_TYPE_ELF_SECTIONS      9
#define MULTIBOOT2_TAG_TYPE_APM               10
#define MULTIBOOT2_TAG_TYPE_EFI32             11
#define MULTIBOOT2_TAG_TYPE_EFI64             12
#define MULTIBOOT2_TAG_TYPE_ACPI_OLD          14
#define MULTIBOOT2_TAG_TYPE_ACPI_NEW          15

// Memory Types
#define MULTIBOOT2_MEMORY_AVAILABLE           1
#define MULTIBOOT2_MEMORY_RESERVED            2
#define MULTIBOOT2_MEMORY_ACPI_RECLAIMABLE    3
#define MULTIBOOT2_MEMORY_NVS                 4
#define MULTIBOOT2_MEMORY_BADRAM              5

// Framebuffer Types
#define MULTIBOOT2_FRAMEBUFFER_TYPE_INDEXED   0
#define MULTIBOOT2_FRAMEBUFFER_TYPE_RGB       1
#define MULTIBOOT2_FRAMEBUFFER_TYPE_EGA_TEXT  2

#pragma pack(push, 1)

// Multiboot2 Header structure
struct Multiboot2Header {
    uint32_t magic;
    uint32_t architecture;
    uint32_t header_length;
    uint32_t checksum;
};

// Generic Tag Structure
struct Multiboot2Tag {
    uint32_t type;
    uint32_t size;
};

// Information Structure Header (passed in EBX / RSI)
struct Multiboot2Info {
    uint32_t total_size;
    uint32_t reserved;
};

// Memory Map Entry
struct Multiboot2MmapEntry {
    uint64_t base_addr;
    uint64_t length;
    uint32_t type;
    uint32_t reserved;
};

// Memory Map Tag
struct Multiboot2MmapTag {
    uint32_t type;          // 6
    uint32_t size;
    uint32_t entry_size;
    uint32_t entry_version;
    // Followed by flexible array of Multiboot2MmapEntry
    Multiboot2MmapEntry entries[0];
};

// Framebuffer Tag
struct Multiboot2FramebufferTag {
    uint32_t type;          // 8
    uint32_t size;
    uint64_t framebuffer_addr;
    uint32_t framebuffer_pitch;
    uint32_t framebuffer_width;
    uint32_t framebuffer_height;
    uint8_t  framebuffer_bpp;
    uint8_t  framebuffer_type;
    uint16_t reserved;
    uint8_t  framebuffer_red_field_position;
    uint8_t  framebuffer_red_mask_size;
    uint8_t  framebuffer_green_field_position;
    uint8_t  framebuffer_green_mask_size;
    uint8_t  framebuffer_blue_field_position;
    uint8_t  framebuffer_blue_mask_size;
};

// Basic Memory Info Tag
struct Multiboot2BasicMeminfoTag {
    uint32_t type;          // 4
    uint32_t size;
    uint32_t mem_lower;     // in KiB
    uint32_t mem_upper;     // in KiB
};

// Command Line Tag
struct Multiboot2CmdlineTag {
    uint32_t type;          // 1
    uint32_t size;
    char string[1];
};

// Boot Loader Name Tag
struct Multiboot2BootLoaderNameTag {
    uint32_t type;          // 2
    uint32_t size;
    char string[1];
};

#pragma pack(pop)

#endif // OXYGEN_MULTIBOOT2_H
