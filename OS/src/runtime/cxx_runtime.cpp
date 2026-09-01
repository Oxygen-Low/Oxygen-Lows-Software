#include "types.h"
#include "mm/heap.h"
#include "drivers/serial.h"

// ------------------------------------------------------------------------------
// Global Dynamic Allocation Operators (Freestanding C++ Runtime)
// ------------------------------------------------------------------------------

void* operator new(size_t size) {
    return kmalloc(size);
}

void* operator new[](size_t size) {
    return kmalloc(size);
}

void operator delete(void* ptr) noexcept {
    kfree(ptr);
}

void operator delete[](void* ptr) noexcept {
    kfree(ptr);
}

void operator delete(void* ptr, size_t size) noexcept {
    UNUSED(size);
    kfree(ptr);
}

void operator delete[](void* ptr, size_t size) noexcept {
    UNUSED(size);
    kfree(ptr);
}

// ------------------------------------------------------------------------------
// Itanium C++ ABI Support & Stubs
// ------------------------------------------------------------------------------

extern "C" {

// Pure virtual function call handler
void __cxa_pure_virtual(void) {
    serial_printf("\n[PANIC] Pure virtual method called!\n");
    while (true) {
        __asm__ volatile ("cli; hlt");
    }
}

// Static destructors stub (kernel persists until system shutdown/poweroff)
int __cxa_atexit(void (*func)(void*), void* arg, void* dso) {
    UNUSED(func);
    UNUSED(arg);
    UNUSED(dso);
    return 0;
}

void* __dso_handle = nullptr;

// GCC / Clang Stack Protector Support
#if defined(__x86_64__) || defined(_M_X64)
uintptr_t __stack_chk_guard = 0x595E5F616C6C6F63ULL;
#else
uintptr_t __stack_chk_guard = 0x595E5F61UL;
#endif

void __stack_chk_fail(void) {
    serial_printf("\n[PANIC] Stack smashing detected!\n");
    while (true) {
        __asm__ volatile ("cli; hlt");
    }
}

// Global Static Constructor Invocation (.init_array)
typedef void (*constructor_fn)(void);

extern constructor_fn __init_array_start[];
extern constructor_fn __init_array_end[];

void call_global_constructors(void) {
    for (constructor_fn* fn = __init_array_start; fn < __init_array_end; ++fn) {
        if (*fn) {
            (*fn)();
        }
    }

    serial_printf("[CXX] Freestanding C++ runtime initialized\n");
}

} // extern "C"
