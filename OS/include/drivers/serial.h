#ifndef OXYGEN_DRIVERS_SERIAL_H
#define OXYGEN_DRIVERS_SERIAL_H

#include "types.h"

#define SERIAL_COM1_BASE 0x3F8
#define SERIAL_COM2_BASE 0x2F8

#ifdef __cplusplus
extern "C" {
#endif

bool serial_init(uint16_t port = SERIAL_COM1_BASE);
bool serial_is_transmit_empty(uint16_t port = SERIAL_COM1_BASE);
bool serial_received(uint16_t port = SERIAL_COM1_BASE);
char serial_getc(uint16_t port = SERIAL_COM1_BASE);
void serial_putc(char c, uint16_t port = SERIAL_COM1_BASE);
void serial_puts(const char* str, uint16_t port = SERIAL_COM1_BASE);

int serial_printf(const char* fmt, ...) __attribute__((format(printf, 1, 2)));
int serial_vprintf(const char* fmt, __builtin_va_list args);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_SERIAL_H
