#include "drivers/vbox_guest.h"
#include "drivers/pci.h"
#include "drivers/mouse.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

bool     g_vbox_available = false;
bool     g_vbox_is_io = true;
uint16_t g_vbox_io_port = 0;
uint64_t g_vbox_mmio_base = 0;
bool     g_absolute_mouse_enabled = false;
uint64_t g_last_host_time_ms = 0;

// Statically allocated hypercall request structures (identity-mapped memory)
alignas(16) VMMDevReqMouseStatus     g_mouse_req;
alignas(16) VMMDevReqHostTime        g_time_req;
alignas(16) VMMDevReqReportGuestInfo g_info_req;
alignas(16) VMMDevReqAckEvents       g_ack_req;

} // anonymous namespace

extern "C" {

bool vbox_guest_is_available(void) {
    return g_vbox_available;
}

uint16_t vbox_guest_get_io_port(void) {
    return g_vbox_io_port;
}

bool vbox_guest_is_absolute_mouse_enabled(void) {
    return g_absolute_mouse_enabled;
}

uint64_t vbox_guest_get_last_sync_time(void) {
    return g_last_host_time_ms;
}

bool vbox_guest_send_request(void* request_phys) {
    if (!g_vbox_available || !request_phys) {
        return false;
    }

    uint32_t phys_addr = (uint32_t)(uintptr_t)request_phys;

    if (g_vbox_is_io) {
        outl(g_vbox_io_port, phys_addr);
    } else if (g_vbox_mmio_base) {
        auto* reg = reinterpret_cast<volatile uint32_t*>(g_vbox_mmio_base);
        *reg = phys_addr;
        __asm__ volatile ("mfence" ::: "memory");
    } else {
        return false;
    }

    auto* hdr = reinterpret_cast<VMMDevRequestHeader*>(request_phys);
    return (hdr->rc == 0);
}

bool vbox_guest_init(void) {
    g_vbox_available = false;
    g_vbox_io_port = 0;
    g_vbox_mmio_base = 0;
    g_absolute_mouse_enabled = false;

    PCIDevice* dev = pci_find_device(PCI_VENDOR_VBOX, PCI_DEVICE_VBOX_GUEST);
    if (!dev) {
        serial_printf("[VBOX] VirtualBox VMMDev PCI device (0x80EE:0xCAFE) not found (Running on QEMU / Bare-Metal)\n");
        return false;
    }

    // Enable PCI Bus Mastering and I/O / Memory Space
    pci_enable_bus_mastering(dev);
    pci_enable_io_space(dev);
    pci_enable_mem_space(dev);

    if (dev->bar_is_io[0]) {
        g_vbox_is_io = true;
        g_vbox_io_port = (uint16_t)dev->bar[0];
        serial_printf("[VBOX] VMMDev I/O Port configured at 0x%04x\n", g_vbox_io_port);
    } else {
        g_vbox_is_io = false;
        g_vbox_mmio_base = dev->bar[0];
        serial_printf("[VBOX] VMMDev MMIO Base configured at 0x%p\n", reinterpret_cast<void*>(g_vbox_mmio_base));
    }

    g_vbox_available = true;

    // Report Guest OS Information to VirtualBox host
    g_info_req.header.size = sizeof(VMMDevReqReportGuestInfo);
    g_info_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_info_req.header.requestType = VMMDEVREQ_REPORT_GUEST_INFO;
    g_info_req.header.rc = -1;
    g_info_req.header.reserved1 = 0;
    g_info_req.header.reserved2 = 0;
    g_info_req.interfaceVersion = 0x00010004;
    g_info_req.osType = 0x00050000; // 64-bit OS (Linux 2.6+/64-bit)
    vbox_guest_send_request(&g_info_req);

    // Initial Host Time Synchronization
    uint64_t host_time = 0;
    if (vbox_guest_get_host_time(&host_time)) {
        serial_printf("[VBOX] Host time synchronized: %lu ms (UTC)\n", host_time);
    }

    // Enable Seamless Absolute Mouse Integration
    if (vbox_guest_enable_absolute_mouse()) {
        serial_printf("[VBOX] Absolute mouse integration active\n");
    }

    serial_printf("[VBOX] VirtualBox Guest Integration initialized successfully\n");
    return true;
}

bool vbox_guest_enable_absolute_mouse(void) {
    if (!g_vbox_available) return false;

    g_mouse_req.header.size = sizeof(VMMDevReqMouseStatus);
    g_mouse_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_mouse_req.header.requestType = VMMDEVREQ_SET_MOUSE_STATUS;
    g_mouse_req.header.rc = -1;
    g_mouse_req.header.reserved1 = 0;
    g_mouse_req.header.reserved2 = 0;
    g_mouse_req.mouseFeatures = VMMDEV_MOUSE_GUEST_CAN_ABSOLUTE;
    g_mouse_req.pointerXPos = 0;
    g_mouse_req.pointerYPos = 0;

    if (vbox_guest_send_request(&g_mouse_req)) {
        g_absolute_mouse_enabled = true;
        return true;
    }

    g_absolute_mouse_enabled = false;
    return false;
}

bool vbox_guest_disable_absolute_mouse(void) {
    if (!g_vbox_available) return false;

    g_mouse_req.header.size = sizeof(VMMDevReqMouseStatus);
    g_mouse_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_mouse_req.header.requestType = VMMDEVREQ_SET_MOUSE_STATUS;
    g_mouse_req.header.rc = -1;
    g_mouse_req.header.reserved1 = 0;
    g_mouse_req.header.reserved2 = 0;
    g_mouse_req.mouseFeatures = 0;
    g_mouse_req.pointerXPos = 0;
    g_mouse_req.pointerYPos = 0;

    vbox_guest_send_request(&g_mouse_req);
    g_absolute_mouse_enabled = false;
    return true;
}

bool vbox_guest_poll_mouse(int32_t screen_w, int32_t screen_h) {
    if (!g_vbox_available || !g_absolute_mouse_enabled) {
        return false;
    }

    g_mouse_req.header.size = sizeof(VMMDevReqMouseStatus);
    g_mouse_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_mouse_req.header.requestType = VMMDEVREQ_GET_MOUSE_STATUS;
    g_mouse_req.header.rc = -1;
    g_mouse_req.header.reserved1 = 0;
    g_mouse_req.header.reserved2 = 0;
    g_mouse_req.mouseFeatures = 0;
    g_mouse_req.pointerXPos = 0;
    g_mouse_req.pointerYPos = 0;

    if (!vbox_guest_send_request(&g_mouse_req)) {
        return false;
    }

    if (screen_w <= 0) screen_w = 1024;
    if (screen_h <= 0) screen_h = 768;

    // Scale 0..0xFFFF VirtualBox coordinate space to screen pixel dimensions
    int32_t x = (int32_t)(((uint64_t)(uint32_t)g_mouse_req.pointerXPos * (uint64_t)screen_w) / 0xFFFF);
    int32_t y = (int32_t)(((uint64_t)(uint32_t)g_mouse_req.pointerYPos * (uint64_t)screen_h) / 0xFFFF);

    mouse_set_position(x, y);
    return true;
}

bool vbox_guest_get_host_time(uint64_t* out_utc_ms) {
    if (!g_vbox_available || !out_utc_ms) {
        return false;
    }

    g_time_req.header.size = sizeof(VMMDevReqHostTime);
    g_time_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_time_req.header.requestType = VMMDEVREQ_GET_HOST_TIME;
    g_time_req.header.rc = -1;
    g_time_req.header.reserved1 = 0;
    g_time_req.header.reserved2 = 0;
    g_time_req.host_time = 0;

    if (vbox_guest_send_request(&g_time_req)) {
        *out_utc_ms = g_time_req.host_time;
        g_last_host_time_ms = g_time_req.host_time;
        return true;
    }

    return false;
}

void vbox_guest_heartbeat(void) {
    if (!g_vbox_available) return;

    // Acknowledge all pending VMMDev events
    g_ack_req.header.size = sizeof(VMMDevReqAckEvents);
    g_ack_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_ack_req.header.requestType = VMMDEVREQ_ACK_EVENTS;
    g_ack_req.header.rc = -1;
    g_ack_req.header.reserved1 = 0;
    g_ack_req.header.reserved2 = 0;
    g_ack_req.events = 0xFFFFFFFF;
    vbox_guest_send_request(&g_ack_req);

    // Synchronize host time
    uint64_t host_ms = 0;
    vbox_guest_get_host_time(&host_ms);
}

void vbox_guest_update(int32_t screen_w, int32_t screen_h) {
    if (!g_vbox_available) return;

    if (g_absolute_mouse_enabled) {
        vbox_guest_poll_mouse(screen_w, screen_h);
    }
}

} // extern "C"
