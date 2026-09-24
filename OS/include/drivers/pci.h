#ifndef OXYGEN_DRIVERS_PCI_H
#define OXYGEN_DRIVERS_PCI_H

#include "types.h"

// PCI I/O Ports
#define PCI_CONFIG_ADDRESS 0x0CF8
#define PCI_CONFIG_DATA    0x0CFC

// Well-known PCI Vendor & Device IDs
#define PCI_VENDOR_VBOX          0x80EE
#define PCI_DEVICE_VBOX_GUEST    0xCAFE
#define PCI_DEVICE_VBOX_VGA      0xBEEF

#define PCI_VENDOR_INTEL         0x8086
#define PCI_DEVICE_INTEL_PIIX3   0x7000
#define PCI_DEVICE_INTEL_PIIX4   0x7110
#define PCI_DEVICE_INTEL_E1000   0x100E

#define PCI_VENDOR_BOCHS_QEMU    0x1234
#define PCI_DEVICE_BOCHS_VGA     0x1111

// PCI Command Register Bits
#define PCI_COMMAND_IO_SPACE     (1 << 0)
#define PCI_COMMAND_MEMORY_SPACE (1 << 1)
#define PCI_COMMAND_BUS_MASTER   (1 << 2)

// Maximum tracked PCI devices
#define PCI_MAX_DEVICES          64

struct PCIDevice {
    uint8_t  bus;
    uint8_t  slot;
    uint8_t  func;
    uint16_t vendor_id;
    uint16_t device_id;
    uint16_t command;
    uint16_t status;
    uint8_t  revision;
    uint8_t  prog_if;
    uint8_t  subclass;
    uint8_t  class_code;
    uint8_t  cache_line_size;
    uint8_t  latency_timer;
    uint8_t  header_type;
    uint8_t  bist;
    uint32_t bar[6];
    uint32_t bar_size[6];
    bool     bar_is_io[6];
    uint8_t  irq_line;
    uint8_t  irq_pin;
};

#ifdef __cplusplus
extern "C" {
#endif

// Configuration space low-level access
uint32_t pci_read_config_dword(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset);
uint16_t pci_read_config_word(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset);
uint8_t  pci_read_config_byte(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset);

void pci_write_config_dword(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset, uint32_t value);
void pci_write_config_word(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset, uint16_t value);
void pci_write_config_byte(uint8_t bus, uint8_t slot, uint8_t func, uint8_t offset, uint8_t value);

// PCI Subsystem Management
void pci_init(void);
void pci_scan(void);
size_t pci_get_device_count(void);
const PCIDevice* pci_get_device(size_t index);

// Device Queries
PCIDevice* pci_find_device(uint16_t vendor_id, uint16_t device_id);
PCIDevice* pci_find_class(uint8_t class_code, uint8_t subclass);

// Device Control
void pci_enable_bus_mastering(PCIDevice* dev);
void pci_enable_io_space(PCIDevice* dev);
void pci_enable_mem_space(PCIDevice* dev);

// VirtualBox Specific Detection
bool pci_is_virtualbox_present(void);
PCIDevice* pci_get_vbox_guest_device(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_PCI_H
