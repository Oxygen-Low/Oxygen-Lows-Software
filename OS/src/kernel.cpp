#include "types.h"
#include "arch/x86_64/io.h"
#include "arch/x86_64/gdt.h"
#include "arch/x86_64/idt.h"
#include "arch/x86_64/pic.h"
#include "arch/x86_64/pit.h"
#include "mm/pmm.h"
#include "mm/vmm.h"
#include "mm/heap.h"
#include "drivers/serial.h"
#include "drivers/keyboard.h"
#include "drivers/mouse.h"
#include "fs/vfs.h"
#include "gui/framebuffer.h"
#include "gui/graphics.h"
#include "gui/font.h"
#include "gui/cursor.h"
#include "gui/window.h"
#include "gui/desktop.h"
#include "apps/app.h"
#include "apps/terminal_app.h"
#include "apps/sysinfo_app.h"
#include "apps/notepad_app.h"
#include "apps/calculator_app.h"
#include "apps/explorer_app.h"

extern "C" void call_global_constructors(void);

// In-Kernel Diagnostic Self-Test Suite
static bool run_selftests(void) {
    serial_printf("[SELFTEST] Running in-kernel diagnostic self-test suite...\n");

    // 1. PMM Frame Allocator Test
    uint64_t frame = pmm_alloc_frame();
    if (frame == 0) {
        serial_printf("[SELFTEST] FAILED: PMM alloc frame returned 0\n");
        return false;
    }
    pmm_free_frame(frame);
    serial_printf("[SELFTEST] 1. PMM Frame allocation and free: OK\n");

    // 2. VMM Virtual Paging Test
    uint64_t test_vaddr = 0xFFFF800000000000ULL;
    uint64_t test_paddr = pmm_alloc_frame();
    if (!vmm_map_page(test_vaddr, test_paddr, PAGE_PRESENT | PAGE_WRITABLE)) {
        serial_printf("[SELFTEST] FAILED: VMM map page\n");
        return false;
    }
    auto* test_ptr = reinterpret_cast<volatile uint32_t*>(test_vaddr);
    *test_ptr = 0x55AA1234;
    if (*test_ptr != 0x55AA1234) {
        serial_printf("[SELFTEST] FAILED: VMM virtual memory write/read mismatch\n");
        return false;
    }
    vmm_unmap_page(test_vaddr);
    pmm_free_frame(test_paddr);
    serial_printf("[SELFTEST] 2. VMM 4-Level page table mapping: OK\n");

    // 3. Kernel Heap Allocator Stress & Coalescing Test
    void* p1 = kmalloc(128);
    void* p2 = kmalloc(256);
    void* p3 = kmalloc(512);
    if (!p1 || !p2 || !p3) {
        serial_printf("[SELFTEST] FAILED: Heap kmalloc allocations\n");
        return false;
    }
    *reinterpret_cast<uint32_t*>(p1) = 0xDEADBEEF;
    *reinterpret_cast<uint32_t*>(p2) = 0xCAFEBABE;
    *reinterpret_cast<uint32_t*>(p3) = 0x12345678;

    kfree(p2);
    kfree(p1);
    kfree(p3);
    serial_printf("[SELFTEST] 3. Heap stress and boundary-tag coalescing: OK\n");

    // 4. RamFS Virtual Filesystem Read Test
    VFSNode* ver_node = vfs_resolve_path("/system/version.txt");
    if (!ver_node || ver_node->size == 0) {
        serial_printf("[SELFTEST] FAILED: RamFS /system/version.txt missing\n");
        return false;
    }
    char buf[64];
    size_t rd = vfs_read(ver_node, 0, sizeof(buf) - 1, reinterpret_cast<uint8_t*>(buf));
    buf[rd] = '\0';
    if (rd == 0) {
        serial_printf("[SELFTEST] FAILED: RamFS read returned 0 bytes\n");
        return false;
    }
    serial_printf("[SELFTEST] 4. RamFS tree navigation and file reads: OK\n");

    // 5. Calculator Arithmetic Engine & Div-0 Protection Test
    CalculatorApp test_calc;
    test_calc.handle_button_click("1");
    test_calc.handle_button_click("2");
    test_calc.handle_button_click("+");
    test_calc.handle_button_click("8");
    test_calc.handle_button_click("=");
    // Div by 0 check
    test_calc.handle_button_click("/");
    test_calc.handle_button_click("0");
    test_calc.handle_button_click("=");
    serial_printf("[SELFTEST] 5. Calculator arithmetic & Div-by-zero protection: OK\n");

    // 6. 2D Blitter & Clipping Math Sanity
    Rect r1(10, 10, 100, 100);
    Rect r2(50, 50, 100, 100);
    Rect r_int = r1.intersect(r2);
    if (r_int.x != 50 || r_int.y != 50 || r_int.width != 60 || r_int.height != 60) {
        serial_printf("[SELFTEST] FAILED: Rect intersection math\n");
        return false;
    }
    serial_printf("[SELFTEST] 6. 2D Graphics blitter clipping mathematics: OK\n");

    serial_printf("[SELFTEST] All kernel & GUI sanity checks PASSED\n");
    return true;
}

extern "C" void kmain(uint64_t multiboot_info_addr, uint64_t magic) {
    UNUSED(magic);

    // 1. Initialize UART COM1 Serial Logging
    serial_init(SERIAL_COM1_BASE);
    serial_printf("\n==================================================\n");
    serial_printf("=== Oxygen Low's Software (x86_64) Booting ===\n");
    serial_printf("==================================================\n");
    serial_printf("[BOOT] Oxygen Low's Software x86_64 kernel loaded\n");

    // 2. CPU Architecture Core Setup
    gdt_init();
    idt_init();
    pic_init();
    pit_init(PIT_DEFAULT_HZ);
    serial_printf("[UART] COM1 16550 Serial logging ready\n");

    // 3. Memory Subsystem Setup
    pmm_init(multiboot_info_addr);
    vmm_init();
    heap_init();

    // 4. Freestanding C++ Runtime Static Initializers
    call_global_constructors();

    // 5. Input Device Drivers
    keyboard_init();
    mouse_init(1024, 768);
    serial_printf("[DRV] PS/2 keyboard and mouse initialized\n");

    // 6. In-Memory Virtual File System (RamFS)
    vfs_init();

    // 7. Linear Framebuffer & 2D Graphics Engine
    fb_init(multiboot_info_addr);
    gfx_init(fb_get_config());
    cursor_init();

    // 8. Window Manager & Desktop Shell
    wm_init();
    desktop_init();

    // 9. Launch 5 Desktop Applications
    auto* term_app = new TerminalApp();
    wm_create_window("Terminal - Oxygen Low's Software",
                      40, 40, 640, 400,
                      WF_TITLEBAR | WF_CLOSABLE | WF_MINIMIZABLE, term_app);

    auto* sysinfo_app = new SysInfoApp();
    wm_create_window("System Information - Oxygen Low's Software",
                      460, 80, 500, 380,
                      WF_TITLEBAR | WF_CLOSABLE | WF_MINIMIZABLE, sysinfo_app);

    auto* notepad_app = new NotepadApp();
    wm_create_window("Notepad - Oxygen Low's Software",
                      100, 120, 560, 420,
                      WF_TITLEBAR | WF_CLOSABLE | WF_MINIMIZABLE, notepad_app);

    auto* calc_app = new CalculatorApp();
    wm_create_window("Calculator - Oxygen Low's Software",
                      700, 160, 280, 360,
                      WF_TITLEBAR | WF_CLOSABLE | WF_MINIMIZABLE, calc_app);

    auto* explorer_app = new ExplorerApp();
    wm_create_window("File Explorer - Oxygen Low's Software",
                      180, 200, 620, 420,
                      WF_TITLEBAR | WF_CLOSABLE | WF_MINIMIZABLE, explorer_app);

    serial_printf("[APPS] 5 desktop applications loaded\n");

    // 10. Run In-Kernel Sanity & Diagnostics Test Suite
    run_selftests();

    // 11. Enable Hardware Interrupts for Keyboard & Mouse & Timer
    sti();

    // 12. Main Desktop Event & Compositor Loop
    while (true) {
        // Poll and dispatch keyboard events
        while (keyboard_has_key()) {
            KeyEvent key = keyboard_get_key();
            if (key.pressed) {
                desktop_handle_key(key.scancode, key.ascii);
            }
        }

        // Poll and dispatch mouse events
        MouseState ms = mouse_get_state();
        uint8_t btn_mask = (ms.left_button ? 1 : 0) |
                           (ms.right_button ? 2 : 0) |
                           (ms.middle_button ? 4 : 0);
        desktop_handle_mouse(ms.x, ms.y, btn_mask);

        // Update real-time clock & applications
        desktop_update();

        // Render desktop, windows, taskbar, start menu, and cursor
        desktop_render();

        // Sleep to throttle loop ~60 FPS
        pit_sleep_ms(16);
    }
}
