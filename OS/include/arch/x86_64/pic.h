#ifndef OXYGEN_ARCH_PIC_H
#define OXYGEN_ARCH_PIC_H

#include "types.h"

// 8259 PIC Port Addresses
#define PIC1_COMMAND_PORT 0x20
#define PIC1_DATA_PORT    0x21
#define PIC2_COMMAND_PORT 0xA0
#define PIC2_DATA_PORT    0xA1

// PIC Initialization Commands
#define ICW1_ICW4         0x01 // Expect ICW4 during init
#define ICW1_SINGLE       0x02 // Single mode (0 = Cascade mode)
#define ICW1_INTERVAL4    0x04 // Call address interval 4 (0 = 8)
#define ICW1_LEVEL        0x08 // Level triggered mode (0 = Edge mode)
#define ICW1_INIT         0x10 // Initialization command word 1

#define ICW4_8086         0x01 // 8086/88 mode (0 = MCS-80/85)
#define ICW4_AUTO         0x02 // Auto EOI
#define ICW4_BUF_SLAVE    0x08 // Buffered mode / slave
#define ICW4_BUF_MASTER   0x0C // Buffered mode / master
#define ICW4_SFNM         0x10 // Special fully nested mode

#define PIC_EOI_COMMAND   0x20 // End of Interrupt command

// Vector Offsets
#define PIC1_VECTOR_OFFSET 0x20 // Vector 32 (IRQ 0 - 7)
#define PIC2_VECTOR_OFFSET 0x28 // Vector 40 (IRQ 8 - 15)

// Standard IRQ Line assignments
#define IRQ_TIMER         0
#define IRQ_KEYBOARD      1
#define IRQ_CASCADE       2
#define IRQ_COM2          3
#define IRQ_COM1          4
#define IRQ_LPT2          5
#define IRQ_FLOPPY        6
#define IRQ_LPT1          7
#define IRQ_RTC           8
#define IRQ_FREE1         9
#define IRQ_FREE2         10
#define IRQ_FREE3         11
#define IRQ_MOUSE         12
#define IRQ_FPU           13
#define IRQ_PRIMARY_ATA   14
#define IRQ_SECONDARY_ATA 15

#ifdef __cplusplus
extern "C" {
#endif

void pic_init(void);
void pic_send_eoi(uint8_t irq);
void pic_set_mask(uint8_t irq);
void pic_clear_mask(uint8_t irq);
void pic_disable(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_ARCH_PIC_H
