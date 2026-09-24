#include "drivers/pci.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

PCIDevice g_devices[PCI_MAX_DEVICES];
size_t g_device_count = 0;
int g_vbox_guest_idx = -1;

void pci_probe_bar(PCIDevice* dev, size_t bar_index) {
    if (bar_index >= 6) return;

    uint8_t bar_offset = 0x10 + (uint8_t)(bar_index * 4);
    uint32_t original_val = pci_read_config_dword(dev->bus, dev->slot, dev->func, bar_offset);

    if (original_val == 0 || original_val == 0xFFFFFFFF) {
        dev->bar[bar_index] = 0;
        dev->bar_size[bar_index] = 0;
        dev->bar_is_io[bar_index] = false;
        return;
    }

    // Write all 1s to probe size
    pci_write_config_dword(dev->bus, dev->slot, dev->func, bar_offset, 0xFFFFFFFF);
    uint32_t mask = pci_read_config_dword(dev->bus, dev->slot, dev->func, bar_offset);

    // Restore original value
    pci_write_config_dword(dev->bus, dev->slot, dev->func, bar_offset, original_val);

    if (original_val & 0x01) {
        // I/O Space BAR
        dev->bar_is_io[bar_index] = true;
        dev->bar[bar_index] = original_val & ~0x03;
        uint32_t size_mask = mask & ~0x03;
        dev->bar_size[bar_index] = size_mask ? (~size_mask + 1) : 0;
    } else {
        // MMIO Space BAR
        dev->bar_is_io[bar_index] = false;
        dev->bar[bar_index] = original_val & ~0x0F;
        uint32_t size_mask = mask & ~0x0F;
        dev->bar_size[bar_index] = size_mask ? (~size_mask + 1) : 0;
    }
}

void pci_check_function(uint8_t bus, uint8_t slot, uint8_t func) {
    uint16_t vendor = pci_read_config_word(bus, slot, func, 0x00);
    if (vendor == 0xFFFF || vendor == 0x0000) {
        return;
    }

    if (g_device_count >= PCI_MAX_DEVICES) {
        return;
    }

    PCIDevice* dev = &g_devices[g_device_count];
    dev->bus = bus;
    dev->slot = slot;
    dev->func = func;
    dev->vendor_id = vendor;
    dev->device_id = pci_read_config_word(bus, slot, func, 0x02);
    dev->command = pci_read_config_word(bus, slot, func, 0x04);
    dev->status = pci_read_config_word(bus, slot, func, 0x06);
    dev->revision = pci_read_config_byte(bus, slot, func, 0x08);
    dev->prog_if = pci_read_config_byte(bus, slot, func, 0x09);
    dev->subclass = pci_read_config_byte(bus, slot, func, 0x0A);
    dev->class_code = pci_read_config_byte(bus, slot, func, 0x0B);
    dev->cache_line_size = pci_read_config_byte(bus, slot, func, 0x0C);
    dev->latency_timer = pci_read_config_byte(bus, slot, func, 0x0D);
    dev->header_type = pci_read_config_byte(bus, slot, func, 0x0E);
    dev->bist = pci_read_config_byte(bus, slot, func, 0x0F);

    uint8_t standard_header = dev->header_type & 0x7F;
    if (standard_header == 0x00) {
        // Standard endpoint device: probe 6 BARs
        for (size_t b = 0; b < 6; ++b) {
            pci_probe_bar(dev, b);
        }
        dev->irq_line = pci_read_config_byte(bus, slot, func, 0x3C);
        dev->irq_pin = pci_read_config_byte(bus, slot, func, 0x3D);
    } else {
        for (size_t b = 0; b < 6; ++b) {
            dev->bar[b] = 0;
            dev->bar_size[b] = 0;
            dev->bar_is_io[b] = false;
        }
        dev->irq_line = 0;
        dev->irq_pin = 0;
    }

    serial_printf("[PCI] Found %02x:%02x.%d: Vendor=0x%04x Device=0x%04x Class=%02x Sub=%02x IRQ=%d\n",
                  bus, slot, func, dev->vendor_id, dev->device_id,
                  dev->class_code, dev->subclass, dev->irq_line);

    // Identify VirtualBox VMMDev device
    if (dev->vendor_id == PCI_VENDOR_VBOX && dev->device_id == PCI_DEVICE_VBOX_GUEST) {
        g_vbox_guest_idx = (int)g_device_count;
        serial_printf("[PCI]   -> VirtualBox Guest Device (VMMDev) matched! BAR0=0x%x (IO=%d)\n",
                      dev->bar[0], dev->bar_is_io[0]);
    } else if (dev->vendor_id == PCI_VENDOR_VBOX && dev->device_id == PCI_DEVICE_VBOX_VGA) {
        serial_printf("[PCI]   -> VirtualBox Graphics Adapter matched! BAR0=0x%x\n", dev->bar[0]);
    } else if (dev->vendor_id == PCI_VENDOR_BOCHS_QEMU && dev->device_id == PCI_DEVICE_BOCHS_VGA) {
        serial_printf("[PCI]   -> QEMU/Bochs Standard VGA Adapter matched! BAR0=0x%x\n", dev->bar[0]);
    }

    g_device_count++;
}

void pci_check_device(uint8_t bus, uint8_t slot) {
    uint16_t vendor = pci_read_config_word(bus, slot, 0, 0x00);
    if (vendor == 0xFFFF || vendor == 0x0000) {
        return;
    }

    pci_check_function(bus, slot, 0);

    uint8_t header_type = pci_read_config_byte(bus, slot, 0, 0x0E);
    if (header_type & 0x80) {
        // Multi-function device: check functions 1..7
        for (uint8_t func = 1; func < 8; ++func) {
            uint16_t func_vendor = pci_read_config_word(bus, slot, func, 0x00);
            if (func_vendor != 0xFFFF && func_vendor != 0x0000) {
                pci_check_function(bus, slot, func);
            }
        }
    }
}

} // anonymous namespace

extern "C" {

uint32_t pci_read_config_dword(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset) {
    uint32_t address = (1U << 31) |
                       ((uint32_t)bus << 16) |
                       ((uint32_t)(slot & 0x1F) << 11) |
                       ((uint32_t)(func & 0x07) << 8) |
                       ((uint32_t)offset & 0xFC);
    outl(PCI_CONFIG_ADDRESS, address);
    return inl(PCI_CONFIG_DATA);
}

uint16_t pci_read_config_word(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset) {
    uint32_t dword = pci_read_config_dword(bus, slot, func, offset);
    return (uint16_t)((dword >> ((offset & 2) * 8)) & 0xFFFF);
}

uint8_t pci_read_config_byte(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset) {
    uint32_t dword = pci_read_config_dword(bus, slot, func, offset);
    return (uint8_t)((dword >> ((offset & 3) * 8)) & 0xFF);
}

void pci_write_config_dword(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset, uint32_t value) {
    uint32_t address = (1U << 31) |
                       ((uint32_t)bus << 16) |
                       ((uint32_t)(slot & 0x1F) << 11) |
                       ((uint32_t)(func & 0x07) << 8) |
                       ((uint32_t)offset & 0xFC);
    outl(PCI_CONFIG_ADDRESS, address);
    outl(PCI_CONFIG_DATA, value);
}

void pci_write_config_word(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset, uint16_t value) {
    uint32_t dword = pci_read_config_dword(bus, slot, func, offset);
    uint32_t shift = (offset & 2) * 8;
    dword = (dword & ~(0xFFFF << shift)) | ((uint32_t)value << shift);
    pci_write_config_dword(bus, slot, func, offset, dword);
}

void pci_write_config_byte(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset, uint8_t value) {
    uint32_t dword = pci_read_config_dword(bus, slot, func, offset);
    uint32_t shift = (offset & 3) * 8;
    dword = (dword & ~(0xFF << shift)) | ((uint32_t)value << shift);
    pci_write_config_dword(bus, slot, func, offset, dword);
}

void pci_scan(void) {
    g_device_count = 0;
    g_vbox_guest_idx = -1;
    serial_printf("[PCI] Starting PCI bus enumeration...\n");

    // Scan bus 0 host bridge
    uint8_t header_type = pci_read_config_byte(0, 0, 0, 0x0E);
    uint8_t max_buses = (header_type & 0x80) ? 8 : 1;

    for (uint8_t bus = 0; bus < max_buses; ++bus) {
        for (uint8_t slot = 0; slot < 32; ++slot) {
            pci_check_device(bus, slot);
        }
    }

    serial_printf("[PCI] Enumeration complete: %u PCI device(s) found\n", (uint32_t)g_device_count);
}

void pci_init(void) {
    pci_scan();
}

size_t pci_get_device_count(void) {
    return g_device_count;
}

const PCIDevice* pci_get_device(size_t index) {
    if (index >= g_device_count) return nullptr;
    return &g_devices[index];
}

PCIDevice* pci_find_device(uint16_t vendor_id, uint16_t device_id) {
    for (size_t i = 0; i < g_device_count; ++i) {
        if (g_devices[i].vendor_id == vendor_id && g_devices[i].device_id == device_id) {
            return &g_devices[i];
        }
    }
    return nullptr;
}

PCIDevice* pci_find_class(uint8_t class_code, uint8_t subclass) {
    for (size_t i = 0; i < g_device_count; ++i) {
        if (g_devices[i].class_code == class_code && g_devices[i].subclass == subclass) {
            return &g_devices[i];
        }
    }
    return nullptr;
}

void pci_enable_bus_mastering(PCIDevice* dev) {
    if (!dev) return;
    uint16_t cmd = pci_read_config_word(dev->bus, dev->slot, dev->func, 0x04);
    cmd |= PCI_COMMAND_BUS_MASTER;
    pci_write_config_word(dev->bus, dev->slot, dev->func, 0x04, cmd);
    dev->command = cmd;
}

void pci_enable_io_space(PCIDevice* dev) {
    if (!dev) return;
    uint16_t cmd = pci_read_config_word(dev->bus, dev->slot, dev->func, 0x04);
    cmd |= PCI_COMMAND_IO_SPACE;
    pci_write_config_word(dev->bus, dev->slot, dev->func, 0x04, cmd);
    dev->command = cmd;
}

void pci_enable_mem_space(PCIDevice* dev) {
    if (!dev) return;
    uint16_t cmd = pci_read_config_word(dev->bus, dev->slot, dev->func, 0x04);
    cmd |= PCI_COMMAND_MEMORY_SPACE;
    pci_write_config_word(dev->bus, dev->slot, dev->func, 0x04, cmd);
    dev->command = cmd;
}

bool pci_is_virtualbox_present(void) {
    return (g_vbox_guest_idx >= 0);
}

PCIDevice* pci_get_vbox_guest_device(void) {
    if (g_vbox_guest_idx >= 0 && (size_t)g_vbox_guest_idx < g_device_count) {
        return &g_devices[g_vbox_guest_idx];
    }
    return nullptr;
}

} // extern "C"
