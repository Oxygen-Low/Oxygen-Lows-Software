#include "arch/x86_64/idt.h"
#include "arch/x86_64/pic.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"
#include "gui/framebuffer.h"
#include "gui/font.h"
#include "gui/graphics.h"

extern "C" void* isr_stub_table[49];

namespace {

alignas(16) IDTEntry g_idt[IDT_MAX_ENTRIES];
IDTPointer g_idtr;
InterruptHandler g_interrupt_handlers[IDT_MAX_ENTRIES] = { nullptr };

const char* g_exception_messages[32] = {
    "Divide Error (#DE)",
    "Debug (#DB)",
    "Non-Maskable Interrupt (NMI)",
    "Breakpoint (#BP)",
    "Overflow (#OF)",
    "Bound Range Exceeded (#BR)",
    "Invalid Opcode (#UD)",
    "Device Not Available (#NM)",
    "Double Fault (#DF)",
    "Coprocessor Segment Overrun",
    "Invalid TSS (#TS)",
    "Segment Not Present (#NP)",
    "Stack-Segment Fault (#SS)",
    "General Protection Fault (#GP)",
    "Page Fault (#PF)",
    "Reserved",
    "x87 FPU Floating-Point Error (#MF)",
    "Alignment Check (#AC)",
    "Machine Check (#MC)",
    "SIMD Floating-Point Exception (#XM)",
    "Virtualization Exception (#VE)",
    "Control Protection Exception (#CP)",
    "Reserved",
    "Reserved",
    "Reserved",
    "Reserved",
    "Reserved",
    "Reserved",
    "Hypervisor Injection Exception",
    "VMM Communication Exception (#VC)",
    "Security Exception (#SX)",
    "Reserved"
};

} // anonymous namespace

extern "C" {

void idt_set_gate(uint8_t vector, void* isr_handler, uint16_t selector, uint8_t flags, uint8_t ist) {
    uint64_t handler_addr = (uint64_t)isr_handler;
    g_idt[vector].isr_low = (uint16_t)(handler_addr & 0xFFFF);
    g_idt[vector].kernel_cs = selector;
    g_idt[vector].ist = ist & 0x07;
    g_idt[vector].attributes = flags;
    g_idt[vector].isr_mid = (uint16_t)((handler_addr >> 16) & 0xFFFF);
    g_idt[vector].isr_high = (uint32_t)((handler_addr >> 32) & 0xFFFFFFFF);
    g_idt[vector].reserved = 0;
}

void register_interrupt_handler(uint8_t vector, InterruptHandler handler) {
    g_interrupt_handlers[vector] = handler;
}

void unregister_interrupt_handler(uint8_t vector) {
    g_interrupt_handlers[vector] = nullptr;
}

void idt_init(void) {
    // Clear all IDT entries and handlers
    for (size_t i = 0; i < IDT_MAX_ENTRIES; ++i) {
        g_idt[i].isr_low = 0;
        g_idt[i].kernel_cs = 0;
        g_idt[i].ist = 0;
        g_idt[i].attributes = 0;
        g_idt[i].isr_mid = 0;
        g_idt[i].isr_high = 0;
        g_idt[i].reserved = 0;
        g_interrupt_handlers[i] = nullptr;
    }

    // Register CPU Exceptions (0-31), IRQs (32-47), and Software Yield (48)
    for (uint8_t i = 0; i < 49; ++i) {
        uint8_t ist = (i == 8) ? 1 : 0; // Use IST1 for Double Fault
        idt_set_gate(i, isr_stub_table[i], 0x08, IDT_FLAG_INTERRUPT_GATE, ist);
    }

    // Setup and load IDTR
    g_idtr.limit = sizeof(g_idt) - 1;
    g_idtr.base = (uint64_t)&g_idt;

    idt_load(&g_idtr);

    serial_printf("[IDT] 64-bit IDT & Exception handlers initialized\n");
}

void idt_dispatch_interrupt(InterruptFrame* frame) {
    if (!frame) return;

    uint64_t vector = frame->int_no;

    // Dispatch to registered handler if present
    if (vector < IDT_MAX_ENTRIES && g_interrupt_handlers[vector]) {
        g_interrupt_handlers[vector](frame);
        return;
    }

    // Spurious IRQ detection for Master (IRQ7, vector 39) and Slave (IRQ15, vector 47)
    if (vector == 39) {
        if (!(pic_get_isr() & (1 << 7))) {
            return; // Spurious IRQ7 on Master PIC: do not send EOI
        }
    } else if (vector == 47) {
        if (!(pic_get_isr() & (1 << 15))) {
            pic_send_eoi(IRQ_CASCADE); // Spurious IRQ15 on Slave PIC: send EOI only to master
            return;
        }
    }

    // CPU Exception handling (Vectors 0 - 31)
    if (vector < 32) {
        const char* name = (vector < 32) ? g_exception_messages[vector] : "Unknown Exception";
        serial_printf("\n=======================================================\n");
        serial_printf("!!! KERNEL PANIC: UNHANDLED CPU EXCEPTION !!!\n");
        serial_printf("Vector: %u (%s) | Error Code: 0x%x\n", (uint32_t)vector, name, (uint32_t)frame->error_code);
        serial_printf("RIP: 0x%p | CS: 0x%x | RFLAGS: 0x%p\n", (void*)frame->rip, (uint32_t)frame->cs, (void*)frame->rflags);
        serial_printf("RSP: 0x%p | SS: 0x%x\n", (void*)frame->rsp, (uint32_t)frame->ss);

        uint64_t cr2 = 0;
        if (vector == 14) { // Page Fault
            cr2 = read_cr2();
            serial_printf("CR2 (Fault Address): 0x%p\n", (void*)cr2);
            serial_printf("Page Fault Cause: %s | %s | %s\n",
                (frame->error_code & 1) ? "Protection Violation" : "Non-Present Page",
                (frame->error_code & 2) ? "Write Access" : "Read Access",
                (frame->error_code & 4) ? "User Mode" : "Kernel Mode");
        }

        serial_printf("RAX: 0x%p | RBX: 0x%p | RCX: 0x%p\n", (void*)frame->rax, (void*)frame->rbx, (void*)frame->rcx);
        serial_printf("RDX: 0x%p | RSI: 0x%p | RDI: 0x%p\n", (void*)frame->rdx, (void*)frame->rsi, (void*)frame->rdi);
        serial_printf("RBP: 0x%p | R8:  0x%p | R9:  0x%p\n", (void*)frame->rbp, (void*)frame->r8, (void*)frame->r9);
        serial_printf("R10: 0x%p | R11: 0x%p | R12: 0x%p\n", (void*)frame->r10, (void*)frame->r11, (void*)frame->r12);
        serial_printf("R13: 0x%p | R14: 0x%p | R15: 0x%p\n", (void*)frame->r13, (void*)frame->r14, (void*)frame->r15);
        serial_printf("=======================================================\n");

        // Graphical Panic Screen (Blue Screen of Death)
        FramebufferConfig* fb = fb_get_config();
        if (fb && fb->is_initialized && fb->virt_addr) {
            uint32_t screen_w = fb->width;
            uint32_t screen_h = fb->height;
            uint32_t* backbuf = fb_get_backbuffer();
            uint32_t blue_color = 0xFF003366; // Deep Blue

            // Clear screen in backbuffer
            for (uint32_t i = 0; i < screen_w * screen_h; ++i) {
                backbuf[i] = blue_color;
            }

            // Ensure drawing is not clipped by an active window clip rect
            gfx_reset_clip_rect();

            int32_t y = 40;
            font_draw_string(40, y, ":( Oxygen Low's Software encountered a fatal kernel problem", COLOR_WHITE);
            y += 24;
            font_draw_string(40, y, "and needs to halt to protect data integrity.", Color(200, 220, 255, 255));
            y += 36;
            font_printf(40, y, COLOR_WHITE, COLOR_TRANSPARENT, "Stop Code: %s (Vector %u, Code 0x%x)", name, (uint32_t)vector, (uint32_t)frame->error_code);
            y += 20;
            font_printf(40, y, Color(200, 220, 255, 255), COLOR_TRANSPARENT, "Fault Address (RIP): 0x%p | CS: 0x%x | RFLAGS: 0x%p", (void*)frame->rip, (uint32_t)frame->cs, (void*)frame->rflags);
            y += 20;
            if (vector == 14) {
                font_printf(40, y, Color(255, 100, 100, 255), COLOR_TRANSPARENT, "Page Fault Address (CR2): 0x%p", (void*)cr2);
                y += 20;
            }
            font_printf(40, y, Color(200, 220, 255, 255), COLOR_TRANSPARENT, "Stack Pointer (RSP): 0x%p | Base Pointer (RBP): 0x%p", (void*)frame->rsp, (void*)frame->rbp);
            y += 20;
            font_printf(40, y, Color(180, 200, 230, 255), COLOR_TRANSPARENT, "RAX: 0x%p  RBX: 0x%p  RCX: 0x%p  RDX: 0x%p", (void*)frame->rax, (void*)frame->rbx, (void*)frame->rcx, (void*)frame->rdx);
            y += 20;
            font_printf(40, y, Color(180, 200, 230, 255), COLOR_TRANSPARENT, "RSI: 0x%p  RDI: 0x%p  R8:  0x%p  R9:  0x%p", (void*)frame->rsi, (void*)frame->rdi, (void*)frame->r8, (void*)frame->r9);
            y += 36;
            font_draw_string(40, y, "Please report this issue to Oxygen Low's Software Support. System halted.", COLOR_WHITE);

            fb_swap_buffers();
        }

        // Halt CPU
        cli();
        while (true) {
            hlt();
        }
    }

    // Default EOI acknowledge for unregistered hardware IRQs (32 - 47)
    if (vector >= 32 && vector < 48) {
        pic_send_eoi((uint8_t)(vector - 32));
    }
}

} // extern "C"
