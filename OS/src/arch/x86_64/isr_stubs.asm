; ==============================================================================
; Oxygen Low's Software - 64-Bit ISR Stubs and Exception Handlers
; ==============================================================================

[BITS 64]

section .text
extern idt_dispatch_interrupt

%macro ISR_NOERRCODE 1
global isr_stub_%1
isr_stub_%1:
    push qword 0                            ; Push dummy error code
    push qword %1                           ; Push interrupt number
    jmp isr_common_stub
%endmacro

%macro ISR_ERRCODE 1
global isr_stub_%1
isr_stub_%1:
    push qword %1                           ; Push interrupt number (error code already on stack)
    jmp isr_common_stub
%endmacro

; ------------------------------------------------------------------------------
; CPU Exceptions (Vectors 0 - 31)
; ------------------------------------------------------------------------------
ISR_NOERRCODE 0                             ; 0: Divide Error (#DE)
ISR_NOERRCODE 1                             ; 1: Debug (#DB)
ISR_NOERRCODE 2                             ; 2: NMI
ISR_NOERRCODE 3                             ; 3: Breakpoint (#BP)
ISR_NOERRCODE 4                             ; 4: Overflow (#OF)
ISR_NOERRCODE 5                             ; 5: BOUND Range Exceeded (#BR)
ISR_NOERRCODE 6                             ; 6: Invalid Opcode (#UD)
ISR_NOERRCODE 7                             ; 7: Device Not Available (#NM)
ISR_ERRCODE   8                             ; 8: Double Fault (#DF)
ISR_NOERRCODE 9                             ; 9: Coprocessor Segment Overrun
ISR_ERRCODE   10                            ; 10: Invalid TSS (#TS)
ISR_ERRCODE   11                            ; 11: Segment Not Present (#NP)
ISR_ERRCODE   12                            ; 12: Stack-Segment Fault (#SS)
ISR_ERRCODE   13                            ; 13: General Protection Fault (#GP)
ISR_ERRCODE   14                            ; 14: Page Fault (#PF)
ISR_NOERRCODE 15                            ; 15: Reserved
ISR_NOERRCODE 16                            ; 16: x87 FPU Floating-Point Error (#MF)
ISR_ERRCODE   17                            ; 17: Alignment Check (#AC)
ISR_NOERRCODE 18                            ; 18: Machine Check (#MC)
ISR_NOERRCODE 19                            ; 19: SIMD Floating-Point Exception (#XM/#XF)
ISR_NOERRCODE 20                            ; 20: Virtualization Exception (#VE)
ISR_ERRCODE   21                            ; 21: Control Protection Exception (#CP)
ISR_NOERRCODE 22                            ; 22: Reserved
ISR_NOERRCODE 23                            ; 23: Reserved
ISR_NOERRCODE 24                            ; 24: Reserved
ISR_NOERRCODE 25                            ; 25: Reserved
ISR_NOERRCODE 26                            ; 26: Reserved
ISR_NOERRCODE 27                            ; 27: Reserved
ISR_NOERRCODE 28                            ; 28: Hypervisor Injection Exception
ISR_ERRCODE   29                            ; 29: VMM Communication Exception (#VC)
ISR_ERRCODE   30                            ; 30: Security Exception (#SX)
ISR_NOERRCODE 31                            ; 31: Reserved

; ------------------------------------------------------------------------------
; IRQs 0 - 15 (Vectors 32 - 47)
; ------------------------------------------------------------------------------
ISR_NOERRCODE 32                            ; IRQ0: PIT Timer
ISR_NOERRCODE 33                            ; IRQ1: PS/2 Keyboard
ISR_NOERRCODE 34                            ; IRQ2: PIC Cascade
ISR_NOERRCODE 35                            ; IRQ3: COM2 Serial
ISR_NOERRCODE 36                            ; IRQ4: COM1 Serial
ISR_NOERRCODE 37                            ; IRQ5: LPT2 / Sound
ISR_NOERRCODE 38                            ; IRQ6: Floppy Disk
ISR_NOERRCODE 39                            ; IRQ7: LPT1 / Spurious
ISR_NOERRCODE 40                            ; IRQ8: CMOS RTC
ISR_NOERRCODE 41                            ; IRQ9: Free / ACPI
ISR_NOERRCODE 42                            ; IRQ10: Free / PCI
ISR_NOERRCODE 43                            ; IRQ11: Free / PCI
ISR_NOERRCODE 44                            ; IRQ12: PS/2 Mouse
ISR_NOERRCODE 45                            ; IRQ13: FPU / Coprocessor
ISR_NOERRCODE 46                            ; IRQ14: Primary ATA Hard Disk
ISR_NOERRCODE 47                            ; IRQ15: Secondary ATA Hard Disk

; ------------------------------------------------------------------------------
; Common ISR Entry and Exit Stub
; ------------------------------------------------------------------------------
isr_common_stub:
    ; Push all general purpose registers
    push rax
    push rbx
    push rcx
    push rdx
    push rsi
    push rdi
    push rbp
    push r8
    push r9
    push r10
    push r11
    push r12
    push r13
    push r14
    push r15

    ; Pass pointer to InterruptFrame (RSP) in RDI (System V ABI)
    mov rdi, rsp

    ; Ensure 16-byte stack alignment before calling C++ dispatcher
    mov rbp, rsp
    and rsp, -16
    call idt_dispatch_interrupt
    mov rsp, rbp

    ; Restore registers in reverse order
    pop r15
    pop r14
    pop r13
    pop r12
    pop r11
    pop r10
    pop r9
    pop r8
    pop rbp
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rbx
    pop rax

    ; Pop interrupt number and error code
    add rsp, 16

    ; Return from interrupt
    iretq

; ------------------------------------------------------------------------------
; Global Table of ISR Entry Points
; ------------------------------------------------------------------------------
section .rodata
global isr_stub_table
isr_stub_table:
%assign i 0
%rep 48
    dq isr_stub_%+i
%assign i i+1
%endrep

; ------------------------------------------------------------------------------
; Architecture Helpers: GDT, TSS, IDT flush
; ------------------------------------------------------------------------------
section .text
global gdt_load
global tss_load
global idt_load

gdt_load:
    ; RDI = GDTPointer*
    lgdt [rdi]
    ; Far return to reload CS
    push qword 0x08                         ; Kernel CS (0x08)
    lea rax, [rel .reload_cs]
    push rax
    retfq
.reload_cs:
    mov ax, 0x10                            ; Kernel Data (0x10)
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov fs, ax
    mov gs, ax
    ret

tss_load:
    ; DI = TSS Selector (0x28)
    ltr di
    ret

idt_load:
    ; RDI = IDTPointer*
    lidt [rdi]
    ret
