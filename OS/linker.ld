ENTRY(_start)
OUTPUT_FORMAT(elf64-x86-64)

PHDRS {
    text PT_LOAD FLAGS(5); /* R_X */
    data PT_LOAD FLAGS(6); /* RW_ */
}

SECTIONS {
    . = 1M;

    .boot ALIGN(4K) : {
        KEEP(*(.multiboot_header))
    } :text

    .text ALIGN(4K) : {
        *(.text*)
    } :text

    .rodata ALIGN(4K) : {
        *(.rodata*)
    } :text

    .data ALIGN(4K) : {
        *(.data*)
    } :data

    .init_array ALIGN(4K) : {
        __init_array_start = .;
        KEEP(*(SORT(.init_array.*)))
        KEEP(*(.init_array*))
        __init_array_end = .;
    } :data

    .bss ALIGN(4K) : {
        *(COMMON)
        *(.bss*)
    } :data

    _kernel_end = .;
}
