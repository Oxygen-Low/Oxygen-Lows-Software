#include "arch/x86_64/gdt.h"
#include "drivers/serial.h"

namespace {

// Standard GDT entries are 8 bytes each.
// 5 standard descriptors (0x00, 0x08, 0x10, 0x18, 0x20) + 1 TSS descriptor (16 bytes, spans 0x28 and 0x30) = 7 entries (56 bytes).
alignas(16) GDTEntry g_gdt[7];
alignas(16) TSS64 g_tss;
GDTPointer g_gdtr;

// Dedicated Interrupt Stack Table 1 (Double Fault) stack
alignas(16) uint8_t g_df_stack[8192];

void set_standard_entry(int index, uint32_t base, uint32_t limit, uint8_t access, uint8_t gran) {
    g_gdt[index].base_low = (uint16_t)(base & 0xFFFF);
    g_gdt[index].base_middle = (uint8_t)((base >> 16) & 0xFF);
    g_gdt[index].base_high = (uint8_t)((base >> 24) & 0xFF);
    g_gdt[index].limit_low = (uint16_t)(limit & 0xFFFF);
    g_gdt[index].granularity = (uint8_t)((limit >> 16) & 0x0F) | (gran & 0xF0);
    g_gdt[index].access = access;
}

void set_tss_entry(int index, uint64_t base, uint32_t limit) {
    TSSDescriptor* desc = (TSSDescriptor*)&g_gdt[index];
    desc->limit_low = (uint16_t)(limit & 0xFFFF);
    desc->base_low = (uint16_t)(base & 0xFFFF);
    desc->base_middle = (uint8_t)((base >> 16) & 0xFF);
    desc->access = 0x89; // Present (0x80) | Ring 0 (0x00) | Type 64-bit TSS (0x09)
    desc->granularity = (uint8_t)((limit >> 16) & 0x0F);
    desc->base_high = (uint8_t)((base >> 24) & 0xFF);
    desc->base_upper = (uint32_t)((base >> 32) & 0xFFFFFFFF);
    desc->reserved = 0;
}

} // anonymous namespace

extern "C" {

void gdt_init(void) {
    // 0x00: Null Descriptor
    set_standard_entry(0, 0, 0, 0, 0);

    // 0x08: Kernel 64-bit Code Segment (Access=0x9A: Present, Ring0, Exec/Read; Gran=0x20: Long Mode L=1)
    set_standard_entry(1, 0, 0xFFFFF, 0x9A, 0x20);

    // 0x10: Kernel 64-bit Data Segment (Access=0x92: Present, Ring0, Read/Write; Gran=0x00)
    set_standard_entry(2, 0, 0xFFFFF, 0x92, 0x00);

    // 0x18: User 64-bit Data Segment (Access=0xF2: Present, Ring3, Read/Write; Gran=0x00)
    set_standard_entry(3, 0, 0xFFFFF, 0xF2, 0x00);

    // 0x20: User 64-bit Code Segment (Access=0xFA: Present, Ring3, Exec/Read; Gran=0x20: Long Mode L=1)
    set_standard_entry(4, 0, 0xFFFFF, 0xFA, 0x20);

    // Initialize TSS64 structure
    for (size_t i = 0; i < sizeof(TSS64); ++i) {
        ((uint8_t*)&g_tss)[i] = 0;
    }
    g_tss.iomap_base = sizeof(TSS64); // Disable I/O permission bitmap

    // Setup IST1 for Double Fault handler
    uint64_t df_stack_top = (uint64_t)g_df_stack + sizeof(g_df_stack);
    g_tss.ist[0] = df_stack_top;

    // 0x28: TSS 64-bit Descriptor (spans entries 5 and 6)
    set_tss_entry(5, (uint64_t)&g_tss, sizeof(TSS64) - 1);

    // Prepare GDTR pointer
    g_gdtr.limit = sizeof(g_gdt) - 1;
    g_gdtr.base = (uint64_t)&g_gdt;

    // Load GDTR and reload CS/DS
    gdt_load(&g_gdtr, GDT_KERNEL_CODE_SELECTOR, GDT_KERNEL_DATA_SELECTOR);

    // Load Task Register (TR)
    tss_load(GDT_TSS_SELECTOR);

    serial_printf("[GDT] 64-bit GDT & TSS initialized\n");
}

void tss_set_stack(uint64_t stack_top) {
    g_tss.rsp0 = stack_top;
}

void tss_set_ist(size_t ist_index, uint64_t stack_top) {
    if (ist_index >= 1 && ist_index <= 7) {
        g_tss.ist[ist_index - 1] = stack_top;
    }
}

} // extern "C"
