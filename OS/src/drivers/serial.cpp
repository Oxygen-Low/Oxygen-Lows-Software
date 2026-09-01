#include "drivers/serial.h"
#include "arch/x86_64/io.h"

namespace {

bool g_serial_initialized = false;
uint16_t g_default_port = SERIAL_COM1_BASE;

void print_number(uint64_t num, int base, bool uppercase, int min_digits, char pad_char) {
    char buf[65];
    int pos = 0;
    const char* digits = uppercase ? "0123456789ABCDEF" : "0123456789abcdef";

    if (num == 0) {
        buf[pos++] = '0';
    } else {
        while (num > 0) {
            buf[pos++] = digits[num % base];
            num /= base;
        }
    }

    while (pos < min_digits && pos < 64) {
        buf[pos++] = pad_char;
    }

    // Output digits in reverse
    for (int i = pos - 1; i >= 0; --i) {
        serial_putc(buf[i], g_default_port);
    }
}

void print_signed(int64_t num, int min_digits, char pad_char) {
    if (num < 0) {
        serial_putc('-', g_default_port);
        num = -num;
    }
    print_number((uint64_t)num, 10, false, min_digits, pad_char);
}

} // anonymous namespace

extern "C" {

bool serial_init(uint16_t port) {
    g_default_port = port;

    outb(port + 1, 0x00);    // Disable all interrupts
    outb(port + 3, 0x80);    // Enable DLAB (set baud rate divisor)
    outb(port + 0, 0x01);    // Divisor low byte (1 = 115200 baud)
    outb(port + 1, 0x00);    // Divisor high byte
    outb(port + 3, 0x03);    // 8 bits, no parity, 1 stop bit (8N1)
    outb(port + 2, 0xC7);    // Enable FIFO, clear TX/RX queues, 14-byte threshold
    outb(port + 4, 0x0B);    // IRQs enabled, RTS/DSR set

    // Hardware loopback self-test
    outb(port + 4, 0x1E);    // Set in loopback mode
    outb(port + 0, 0xAE);    // Write test byte
    if (inb(port + 0) != 0xAE) {
        g_serial_initialized = false;
        return false;
    }

    // Return to normal operation mode
    outb(port + 4, 0x0F);
    g_serial_initialized = true;
    return true;
}

bool serial_is_transmit_empty(uint16_t port) {
    return (inb(port + 5) & 0x20) != 0;
}

bool serial_received(uint16_t port) {
    return (inb(port + 5) & 0x01) != 0;
}

char serial_getc(uint16_t port) {
    while (!serial_received(port));
    return (char)inb(port);
}

void serial_putc(char c, uint16_t port) {
    while (!serial_is_transmit_empty(port));
    outb(port, (uint8_t)c);
}

void serial_puts(const char* str, uint16_t port) {
    if (!str) return;
    while (*str) {
        if (*str == '\n') {
            serial_putc('\r', port);
        }
        serial_putc(*str++, port);
    }
}

int serial_vprintf(const char* fmt, __builtin_va_list args) {
    if (!fmt) return 0;
    int written = 0;

    for (const char* p = fmt; *p != '\0'; ++p) {
        if (*p != '%') {
            if (*p == '\n') {
                serial_putc('\r', g_default_port);
                written++;
            }
            serial_putc(*p, g_default_port);
            written++;
            continue;
        }

        ++p; // Skip '%'
        if (*p == '\0') break;

        // Flags & width parsing
        char pad_char = ' ';
        int min_digits = 0;
        if (*p == '0') {
            pad_char = '0';
            ++p;
        }
        while (*p >= '0' && *p <= '9') {
            min_digits = min_digits * 10 + (*p - '0');
            ++p;
        }

        // Length modifiers
        bool is_long = false;
        if (*p == 'l') {
            is_long = true;
            ++p;
            if (*p == 'l') { // 'll'
                ++p;
            }
        }

        switch (*p) {
            case 's': {
                const char* s = __builtin_va_arg(args, const char*);
                if (!s) s = "(null)";
                serial_puts(s, g_default_port);
                break;
            }
            case 'c': {
                char c = (char)__builtin_va_arg(args, int);
                serial_putc(c, g_default_port);
                written++;
                break;
            }
            case 'd':
            case 'i': {
                if (is_long) {
                    int64_t val = __builtin_va_arg(args, int64_t);
                    print_signed(val, min_digits, pad_char);
                } else {
                    int32_t val = __builtin_va_arg(args, int32_t);
                    print_signed((int64_t)val, min_digits, pad_char);
                }
                break;
            }
            case 'u': {
                if (is_long) {
                    uint64_t val = __builtin_va_arg(args, uint64_t);
                    print_number(val, 10, false, min_digits, pad_char);
                } else {
                    uint32_t val = __builtin_va_arg(args, uint32_t);
                    print_number((uint64_t)val, 10, false, min_digits, pad_char);
                }
                break;
            }
            case 'x': {
                if (is_long) {
                    uint64_t val = __builtin_va_arg(args, uint64_t);
                    print_number(val, 16, false, min_digits, pad_char);
                } else {
                    uint32_t val = __builtin_va_arg(args, uint32_t);
                    print_number((uint64_t)val, 16, false, min_digits, pad_char);
                }
                break;
            }
            case 'X': {
                if (is_long) {
                    uint64_t val = __builtin_va_arg(args, uint64_t);
                    print_number(val, 16, true, min_digits, pad_char);
                } else {
                    uint32_t val = __builtin_va_arg(args, uint32_t);
                    print_number((uint64_t)val, 16, true, min_digits, pad_char);
                }
                break;
            }
            case 'p': {
                void* ptr = __builtin_va_arg(args, void*);
                serial_puts("0x", g_default_port);
                print_number((uint64_t)ptr, 16, false, 16, '0');
                break;
            }
            case '%': {
                serial_putc('%', g_default_port);
                written++;
                break;
            }
            default: {
                serial_putc('%', g_default_port);
                serial_putc(*p, g_default_port);
                written += 2;
                break;
            }
        }
    }
    return written;
}

int serial_printf(const char* fmt, ...) {
    __builtin_va_list args;
    __builtin_va_start(args, fmt);
    int ret = serial_vprintf(fmt, args);
    __builtin_va_end(args);
    return ret;
}

} // extern "C"
