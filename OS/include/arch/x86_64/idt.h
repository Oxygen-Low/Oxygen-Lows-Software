#ifndef OXYGEN_ARCH_IDT_H
#define OXYGEN_ARCH_IDT_H

#include "types.h"

#define IDT_MAX_ENTRIES 256

// Gate Attribute Flags
#define IDT_ATTR_PRESENT     0x80
#define IDT_ATTR_RING0       0x00
#define IDT_ATTR_RING3       0x60
#define IDT_ATTR_INT_GATE    0x0E // 64-bit Interrupt Gate
#define IDT_ATTR_TRAP_GATE   0x0F // 64-bit Trap Gate

#define IDT_FLAG_INTERRUPT_GATE (IDT_ATTR_PRESENT | IDT_ATTR_RING0 | IDT_ATTR_INT_GATE) // 0x8E
#define IDT_FLAG_USER_GATE      (IDT_ATTR_PRESENT | IDT_ATTR_RING3 | IDT_ATTR_INT_GATE) // 0xEE

#pragma pack(push, 1)

// 16-byte IDT Gate Descriptor for x86_64 Long Mode
struct IDTEntry {
    uint16_t isr_low;          // Bits 0..15 of ISR entry address
    uint16_t kernel_cs;        // Code segment selector (0x08)
    uint8_t  ist;              // Bits 0..2 = IST index (0=none, 1..7=IST1..IST7), bits 3..7 = 0
    uint8_t  attributes;       // Type and attribute flags (0x8E, 0xEE)
    uint16_t isr_mid;          // Bits 16..31 of ISR entry address
    uint32_t isr_high;         // Bits 32..63 of ISR entry address
    uint32_t reserved;         // Reserved, must be 0
};

// IDT Register Pointer (IDTR)
struct IDTPointer {
    uint16_t limit;            // Table size - 1 (256 * 16 - 1 = 4095)
    uint64_t base;             // Linear base address of IDT
};

// Stack Frame passed to C++ interrupt handlers
struct InterruptFrame {
    // Pushed by common assembly ISR stub in reverse order
    uint64_t r15;
    uint64_t r14;
    uint64_t r13;
    uint64_t r12;
    uint64_t r11;
    uint64_t r10;
    uint64_t r9;
    uint64_t r8;
    uint64_t rbp;
    uint64_t rdi;
    uint64_t rsi;
    uint64_t rdx;
    uint64_t rcx;
    uint64_t rbx;
    uint64_t rax;

    // Vector and Error Code pushed by stub
    uint64_t int_no;
    uint64_t error_code;

    // Pushed automatically by CPU hardware on interrupt
    uint64_t rip;
    uint64_t cs;
    uint64_t rflags;
    uint64_t rsp;
    uint64_t ss;
};

#pragma pack(pop)

typedef void (*InterruptHandler)(InterruptFrame* frame);

#ifdef __cplusplus
extern "C" {
#endif

void idt_init(void);
void idt_set_gate(uint8_t vector, void* isr_handler, uint16_t selector, uint8_t flags, uint8_t ist = 0);
void register_interrupt_handler(uint8_t vector, InterruptHandler handler);
void unregister_interrupt_handler(uint8_t vector);
void idt_load(IDTPointer* idt_ptr);

// C++ dispatcher called directly from assembly stub
void idt_dispatch_interrupt(InterruptFrame* frame);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_ARCH_IDT_H
