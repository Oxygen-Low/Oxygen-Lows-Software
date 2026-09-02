; ==============================================================================
; Oxygen Low's Software - Bare-Metal x86_64 Bootloader & Multiboot2 Entry
; ==============================================================================

[BITS 32]

; ------------------------------------------------------------------------------
; Multiboot2 Header
; ------------------------------------------------------------------------------
section .multiboot_header
align 8
header_start:
    dd 0xE85250D6                           ; Multiboot2 magic number
    dd 0                                    ; Architecture 0 (i386 32-bit protected mode)
    dd header_end - header_start            ; Header length
    dd -(0xE85250D6 + 0 + (header_end - header_start)) ; Checksum

    ; Tag 1: Information Request Tag
align 8
tag_info_req_start:
    dw 1                                    ; Type = 1 (information request)
    dw 0                                    ; Flags = 0
    dd tag_info_req_end - tag_info_req_start ; Size = 24 bytes
    dd 6                                    ; Request Tag 6 (Memory Map)
    dd 8                                    ; Request Tag 8 (Framebuffer)
    dd 1                                    ; Request Tag 1 (Command Line)
    dd 4                                    ; Request Tag 4 (Basic Memory Info)
tag_info_req_end:

    ; Tag 5: Linear Framebuffer Request Tag (1024x768x32)
align 8
tag_fb_start:
    dw 5                                    ; Type = 5 (framebuffer)
    dw 0                                    ; Flags = 0
    dd 20                                   ; Size = 20 bytes
    dd 1024                                 ; Preferred width
    dd 768                                  ; Preferred height
    dd 32                                   ; Preferred depth (32 bits per pixel)
tag_fb_end:

    ; Tag 6: Module Alignment Tag
align 8
tag_align_start:
    dw 6                                    ; Type = 6 (module alignment)
    dw 0                                    ; Flags = 0
    dd 8                                    ; Size = 8 bytes
tag_align_end:

    ; Tag 0: Mandatory End Tag
align 8
tag_end_start:
    dw 0                                    ; Type = 0
    dw 0                                    ; Flags = 0
    dd 8                                    ; Size = 8 bytes
tag_end_end:

header_end:

; ------------------------------------------------------------------------------
; 32-Bit Protected Mode Entry Point
; ------------------------------------------------------------------------------
section .text
global _start
extern kmain

_start:
    cli                                     ; Disable hardware interrupts
    cld

    ; Initialize temporary 32-bit stack
    mov esp, stack_top_32

    ; Save Multiboot2 boot registers
    mov esi, ebx                            ; ESI = Multiboot2 Info Physical Pointer
    mov edi, eax                            ; EDI = Multiboot2 Magic (0x36D76289)

    ; Verify Multiboot2 Magic
    cmp edi, 0x36D76289
    jne error_no_multiboot

    ; Check CPUID availability
    call check_cpuid

    ; Check 64-bit Long Mode support
    call check_long_mode

    ; Enable SSE and FPU
    call enable_sse

    ; Setup early 4-level identity and higher-half paging
    call setup_page_tables

    ; Enable PAE (Physical Address Extension) in CR4
    mov eax, cr4
    or eax, 1 << 5                          ; CR4.PAE = 1
    mov cr4, eax

    ; Load CR3 with physical base address of PML4
    mov eax, pml4_table
    mov cr3, eax

    ; Enable Long Mode (LME) and No-Execute (NXE) in IA32_EFER MSR (0xC0000080)
    mov ecx, 0xC0000080
    rdmsr
    or eax, (1 << 8) | (1 << 11)            ; Bit 8 = LME, Bit 11 = NXE
    wrmsr

    ; Enable Paging (PG) and Protection (PE) in CR0
    mov eax, cr0
    or eax, (1 << 31) | 1                   ; CR0.PG = 1, CR0.PE = 1
    mov cr0, eax

    ; Load temporary 64-bit GDT
    lgdt [gdt64_ptr]

    ; Far jump to 64-bit code segment
    jmp 0x08:long_mode_entry

; ------------------------------------------------------------------------------
; 32-Bit Helper Routines & Error Handlers
; ------------------------------------------------------------------------------
check_cpuid:
    pushfd
    pop eax
    mov ecx, eax
    xor eax, 1 << 21                        ; Flip ID bit in EFLAGS
    push eax
    popfd
    pushfd
    pop eax
    push ecx
    popfd
    cmp eax, ecx
    je error_no_cpuid
    ret

check_long_mode:
    mov eax, 0x80000000
    cpuid
    cmp eax, 0x80000001
    jb error_no_long_mode

    mov eax, 0x80000001
    cpuid
    test edx, 1 << 29                       ; Test Long Mode flag (bit 29)
    jz error_no_long_mode
    ret

enable_sse:
    ; CR0: Clear EM (bit 2), Set MP (bit 1)
    mov eax, cr0
    and eax, ~(1 << 2)
    or eax, 1 << 1
    mov cr0, eax

    ; CR4: Set OSFXSR (bit 9), OSXMMEXCPT (bit 10)
    mov eax, cr4
    or eax, (1 << 9) | (1 << 10)
    mov cr4, eax
    ret

setup_page_tables:
    ; PML4[0] -> pdpt_table (Identity map lower 4GB)
    mov eax, pdpt_table
    or eax, 0x03                            ; Present | Writable
    mov [pml4_table], eax

    ; PML4[511] -> pdpt_high (Higher-half kernel map)
    mov eax, pdpt_high
    or eax, 0x03
    mov [pml4_table + 511 * 8], eax

    ; PDPT[0] -> pd_table_0 (0 to 1GB)
    mov eax, pd_table_0
    or eax, 0x03
    mov [pdpt_table], eax

    ; PDPT[1] -> pd_table_1 (1 to 2GB)
    mov eax, pd_table_1
    or eax, 0x03
    mov [pdpt_table + 8], eax

    ; PDPT[2] -> pd_table_2 (2 to 3GB)
    mov eax, pd_table_2
    or eax, 0x03
    mov [pdpt_table + 16], eax

    ; PDPT[3] -> pd_table_3 (3 to 4GB)
    mov eax, pd_table_3
    or eax, 0x03
    mov [pdpt_table + 24], eax

    ; PDPT_HIGH[510] -> pd_table_0 (Higher-half maps to lower 1GB physical)
    mov eax, pd_table_0
    or eax, 0x03
    mov [pdpt_high + 510 * 8], eax

    ; Fill all 2048 PD entries (4 tables x 512) with 2MB huge pages
    ; pd_table_0..3 are contiguous in BSS, so iterate from pd_table_0
    ; Entry physical address = ecx * 2MB = ecx << 21
    ; Flags: 0x83 = Present | Writable | Huge (2MB)
    ; For ecx >= 1024 (phys >= 2GB, MMIO/VRAM region), add PCD (bit 4)
    ; PCD flag: 0x93 = Present | Writable | PCD | Huge
    mov edi, pd_table_0
    mov ecx, 0
.map_all_pd:
    mov eax, ecx
    shl eax, 21                             ; EAX = ecx * 2MB (physical base)
    cmp ecx, 1024                           ; 1024 * 2MB = 2GB boundary
    jb .map_normal
    or eax, 0x93                            ; Present | Writable | PCD | Huge (MMIO)
    jmp .map_store
.map_normal:
    or eax, 0x83                            ; Present | Writable | Huge (RAM)
.map_store:
    mov [edi + ecx * 8], eax
    mov dword [edi + ecx * 8 + 4], 0        ; Upper 32 bits = 0
    inc ecx
    cmp ecx, 2048                           ; 4 * 512 = 2048 total entries
    jne .map_all_pd
    ret

; Fatal error halt routines (writes error character to VGA memory 0xB8000)
error_no_multiboot:
    mov dword [0xB8000], 0x4F324F4D         ; "M2" in red
    cli
    hlt
    jmp error_no_multiboot

error_no_cpuid:
    mov dword [0xB8000], 0x4F434F4E         ; "NC" in red
    cli
    hlt
    jmp error_no_cpuid

error_no_long_mode:
    mov dword [0xB8000], 0x4F4C4F4E         ; "NL" in red
    cli
    hlt
    jmp error_no_long_mode

; ------------------------------------------------------------------------------
; 64-Bit Long Mode Entry Point
; ------------------------------------------------------------------------------
[BITS 64]
long_mode_entry:
    ; Reload segment registers with 64-bit data selector (0x10)
    mov ax, 0x10
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov fs, ax
    mov gs, ax

    ; Initialize 64-bit kernel stack
    mov rsp, kernel_stack_top

    ; Pass Multiboot2 info address in RDI, magic in RSI (System V AMD64 ABI)
    mov rdi, rsi                            ; RDI = Multiboot2 Info Physical Address
    mov rsi, 0x36D76289                     ; RSI = Multiboot2 Magic Number

    ; Call 64-bit C++ kernel entry point
    call kmain

    ; Hang if kmain returns
    cli
.hang:
    hlt
    jmp .hang

; ------------------------------------------------------------------------------
; Early GDT Table (64-Bit)
; ------------------------------------------------------------------------------
section .rodata
align 16
gdt64_start:
    ; 0x00: Null Descriptor
    dq 0x0000000000000000
    ; 0x08: 64-bit Kernel Code Segment (Present, Ring 0, Exec/Read, Long Mode L=1, D=0)
    dq 0x00AF9A000000FFFF
    ; 0x10: 64-bit Kernel Data Segment (Present, Ring 0, Read/Write)
    dq 0x00CF92000000FFFF
gdt64_end:

gdt64_ptr:
    dw gdt64_end - gdt64_start - 1          ; Limit
    dq gdt64_start                          ; Base

; ------------------------------------------------------------------------------
; Early Paging Tables & Stacks (.bss)
; ------------------------------------------------------------------------------
section .bss
align 4096
pml4_table:
    resb 4096
pdpt_table:
    resb 4096
pdpt_high:
    resb 4096
pd_table_0:
    resb 4096
pd_table_1:
    resb 4096
pd_table_2:
    resb 4096
pd_table_3:
    resb 4096

align 16
stack_bottom_32:
    resb 4096
stack_top_32:

align 16
global kernel_stack_bottom
global kernel_stack_top
kernel_stack_bottom:
    resb 65536                              ; 64 KiB Kernel Stack
kernel_stack_top:
