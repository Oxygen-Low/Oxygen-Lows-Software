ENTRY(_start)
OUTPUT_FORMAT(elf64-x86-64)

SECTIONS {
    . = 1M;

    .boot ALIGN(4K) : {
        KEEP(*(.multiboot_header))
    }

    .text ALIGN(4K) : {
        *(.text*)
    }

    .rodata ALIGN(4K) : {
        *(.rodata*)
    }

    .data ALIGN(4K) : {
        *(.data*)
    }

    .init_array ALIGN(4K) : {
        __init_array_start = .;
        KEEP(*(SORT(.init_array.*)))
        KEEP(*(.init_array*))
        __init_array_end = .;
    }

    .bss ALIGN(4K) : {
        *(COMMON)
        *(.bss*)
    }

    _kernel_end = .;
}
