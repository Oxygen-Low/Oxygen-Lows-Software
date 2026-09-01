#include "arch/x86_64/pic.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

extern "C" {

void pic_init(void) {
    // ICW1: Start initialization sequence in cascade mode
    outb(PIC1_COMMAND_PORT, ICW1_INIT | ICW1_ICW4);
    io_wait();
    outb(PIC2_COMMAND_PORT, ICW1_INIT | ICW1_ICW4);
    io_wait();

    // ICW2: Set vector offsets (Master = 0x20/32, Slave = 0x28/40)
    outb(PIC1_DATA_PORT, PIC1_VECTOR_OFFSET);
    io_wait();
    outb(PIC2_DATA_PORT, PIC2_VECTOR_OFFSET);
    io_wait();

    // ICW3: Master has slave at IRQ2 (0000 0100b), Slave attached at IRQ2 (0000 0010b)
    outb(PIC1_DATA_PORT, 0x04);
    io_wait();
    outb(PIC2_DATA_PORT, 0x02);
    io_wait();

    // ICW4: Set 8086/88 microprocessor mode
    outb(PIC1_DATA_PORT, ICW4_8086);
    io_wait();
    outb(PIC2_DATA_PORT, ICW4_8086);
    io_wait();

    // Mask all IRQs except cascade line (IRQ 2) initially
    outb(PIC1_DATA_PORT, 0xFB); // 1111 1011b
    io_wait();
    outb(PIC2_DATA_PORT, 0xFF); // 1111 1111b
    io_wait();

    serial_printf("[PIC] 8259 PIC remapped to vectors 32-47\n");
}

void pic_send_eoi(uint8_t irq) {
    if (irq >= 8) {
        outb(PIC2_COMMAND_PORT, PIC_EOI_COMMAND);
    }
    outb(PIC1_COMMAND_PORT, PIC_EOI_COMMAND);
}

void pic_set_mask(uint8_t irq) {
    uint16_t port;
    if (irq < 8) {
        port = PIC1_DATA_PORT;
    } else {
        port = PIC2_DATA_PORT;
        irq -= 8;
    }
    uint8_t mask = inb(port) | (uint8_t)(1 << irq);
    outb(port, mask);
}

void pic_clear_mask(uint8_t irq) {
    uint16_t port;
    if (irq < 8) {
        port = PIC1_DATA_PORT;
    } else {
        port = PIC2_DATA_PORT;
        irq -= 8;
    }
    uint8_t mask = inb(port) & (uint8_t)~(1 << irq);
    outb(port, mask);
}

void pic_disable(void) {
    outb(PIC1_DATA_PORT, 0xFF);
    outb(PIC2_DATA_PORT, 0xFF);
}

} // extern "C"
