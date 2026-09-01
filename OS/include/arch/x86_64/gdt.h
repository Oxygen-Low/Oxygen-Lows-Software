#ifndef OXYGEN_ARCH_GDT_H
#define OXYGEN_ARCH_GDT_H

#include "types.h"

// Segment Selectors
#define GDT_NULL_SELECTOR         0x00
#define GDT_KERNEL_CODE_SELECTOR  0x08
#define GDT_KERNEL_DATA_SELECTOR  0x10
#define GDT_USER_DATA_SELECTOR    0x18
#define GDT_USER_CODE_SELECTOR    0x20
#define GDT_TSS_SELECTOR          0x28

#define GDT_USER_DATA_R3          (GDT_USER_DATA_SELECTOR | 3)
#define GDT_USER_CODE_R3          (GDT_USER_CODE_SELECTOR | 3)

#pragma pack(push, 1)

// Standard 8-byte GDT Entry
struct GDTEntry {
    uint16_t limit_low;
    uint16_t base_low;
    uint8_t  base_middle;
    uint8_t  access;
    uint8_t  granularity;
    uint8_t  base_high;
};

// 16-byte TSS Descriptor for x86_64 Long Mode
struct TSSDescriptor {
    uint16_t limit_low;
    uint16_t base_low;
    uint8_t  base_middle;
    uint8_t  access;           // 0x89 (Present, Ring 0, 64-bit TSS Available)
    uint8_t  granularity;      // Limit high nibble and flags
    uint8_t  base_high;
    uint32_t base_upper;       // Bits 32-63 of TSS physical base address
    uint32_t reserved;         // Must be zero
};

// 104-byte 64-bit Task State Segment
struct TSS64 {
    uint32_t reserved0;
    uint64_t rsp0;             // Stack pointer for Ring 0 switch
    uint64_t rsp1;             // Stack pointer for Ring 1
    uint64_t rsp2;             // Stack pointer for Ring 2
    uint64_t reserved1;
    uint64_t ist[7];           // IST1 to IST7 stack pointers
    uint64_t reserved2;
    uint16_t reserved3;
    uint16_t iomap_base;       // Offset from base to I/O Permission Bitmap
};

// GDT Register Pointer (GDTR)
struct GDTPointer {
    uint16_t limit;            // Table size - 1
    uint64_t base;             // Linear address of GDT array
};

#pragma pack(pop)

#ifdef __cplusplus
extern "C" {
#endif

void gdt_init(void);
void tss_set_stack(uint64_t stack_top);
void tss_set_ist(size_t ist_index, uint64_t stack_top);
void gdt_load(GDTPointer* gdt_ptr, uint16_t code_sel, uint16_t data_sel);
void tss_load(uint16_t tss_sel);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_ARCH_GDT_H
