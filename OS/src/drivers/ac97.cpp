#include "drivers/ac97.h"
#include "arch/x86_64/io.h"
#include "arch/x86_64/pit.h"
#include "mm/heap.h"
#include "mm/pmm.h"
#include "drivers/serial.h"

// PCI Configuration Ports
#define PCI_CONFIG_ADDRESS 0xCF8
#define PCI_CONFIG_DATA    0xCFC

// AC97 Mixer Registers (NAM)
#define AC97_REG_RESET        0x00
#define AC97_REG_MASTER_VOL   0x02
#define AC97_REG_PCM_OUT_VOL  0x18
#define AC97_REG_EXT_AUDIO_ID 0x28
#define AC97_REG_EXT_AUDIO_ST 0x2A
#define AC97_REG_FRONT_DAC_RT 0x2C

// AC97 Bus Master Registers (NABM)
#define AC97_PO_BDBAR 0x10 // Buffer Descriptor Base Address
#define AC97_PO_CIV   0x14 // Current Index Value
#define AC97_PO_LVI   0x15 // Last Valid Index
#define AC97_PO_SR    0x16 // Status Register
#define AC97_PO_PICB  0x18 // Position in Current Buffer
#define AC97_PO_CR    0x1B // Control Register

// Buffer Descriptor List Entry
struct alignas(8) AC97BufferDescriptor {
    uint32_t buffer_phys_addr;
    uint16_t sample_count;     // samples per buffer (max 0xFFFE)
    uint16_t flags;            // bit 15: IOC (Interrupt on Completion), bit 14: BUP (Buffer Underrun Policy)
};

namespace {

AC97DeviceInfo g_ac97_info = { false, 0, 0, 0, 0, 0, 80 };

uint32_t pci_read_config_32(uint8_t bus, uint8_t dev, uint8_t func, uint8_t offset) {
    uint32_t address = (static_cast<uint32_t>(1) << 31) |
                       (static_cast<uint32_t>(bus) << 16) |
                       (static_cast<uint32_t>(dev) << 11) |
                       (static_cast<uint32_t>(func) << 8) |
                       (offset & 0xFC);
    outl(PCI_CONFIG_ADDRESS, address);
    return inl(PCI_CONFIG_DATA);
}

void pci_write_config_16(uint8_t bus, uint8_t dev, uint8_t func, uint8_t offset, uint16_t val) {
    uint32_t address = (static_cast<uint32_t>(1) << 31) |
                       (static_cast<uint32_t>(bus) << 16) |
                       (static_cast<uint32_t>(dev) << 11) |
                       (static_cast<uint32_t>(func) << 8) |
                       (offset & 0xFC);
    outl(PCI_CONFIG_ADDRESS, address);
    uint32_t shift = (offset & 2) * 8;
    uint32_t cur = inl(PCI_CONFIG_DATA);
    cur = (cur & ~(0xFFFF << shift)) | (static_cast<uint32_t>(val) << shift);
    outl(PCI_CONFIG_DATA, cur);
}

} // anonymous namespace

extern "C" {

bool ac97_init(void) {
    g_ac97_info.present = false;

    // Scan PCI bus 0 for Multimedia Audio Device (Class 0x04, Subclass 0x01) or known AC97 Vendor IDs
    for (uint8_t dev = 0; dev < 32; ++dev) {
        for (uint8_t func = 0; func < 8; ++func) {
            uint32_t id_reg = pci_read_config_32(0, dev, func, 0x00);
            uint16_t vendor = static_cast<uint16_t>(id_reg & 0xFFFF);
            uint16_t device = static_cast<uint16_t>((id_reg >> 16) & 0xFFFF);

            if (vendor == 0xFFFF || vendor == 0x0000) {
                if (func == 0) break;
                continue;
            }

            uint32_t class_reg = pci_read_config_32(0, dev, func, 0x08);
            uint8_t base_class = static_cast<uint8_t>((class_reg >> 24) & 0xFF);
            uint8_t sub_class  = static_cast<uint8_t>((class_reg >> 16) & 0xFF);

            // Intel 82801 (ICH) AC'97 Audio or Multimedia Audio Controller
            if ((base_class == 0x04 && sub_class == 0x01) ||
                (vendor == 0x8086 && (device == 0x2415 || device == 0x2425 || device == 0x2445 || device == 0x2485 || device == 0x24C5 || device == 0x24D5 || device == 0x266E)) ||
                (vendor == 0x10EC && (device == 0x0560 || device == 0x0562))) {
                
                // Read BAR0 (NAM Base) and BAR1 (NABM Base)
                uint32_t bar0 = pci_read_config_32(0, dev, func, 0x10);
                uint32_t bar1 = pci_read_config_32(0, dev, func, 0x14);

                g_ac97_info.nam_base  = static_cast<uint16_t>(bar0 & ~0x1);
                g_ac97_info.nabm_base = static_cast<uint16_t>(bar1 & ~0x1);
                g_ac97_info.vendor_id = vendor;
                g_ac97_info.device_id = device;

                // Read IRQ
                uint32_t irq_reg = pci_read_config_32(0, dev, func, 0x3C);
                g_ac97_info.irq = static_cast<uint8_t>(irq_reg & 0xFF);

                // Enable Bus Mastering (Bit 2) and I/O Space (Bit 0) in PCI Command Register
                uint32_t cmd = pci_read_config_32(0, dev, func, 0x04);
                pci_write_config_16(0, dev, func, 0x04, static_cast<uint16_t>(cmd | 0x05));

                // Reset AC97 codec
                outw(g_ac97_info.nam_base + AC97_REG_RESET, 0x0000);
                pit_sleep_ms(10);

                // Set default volume (unmuted, ~80%)
                ac97_set_volume(80);

                // Set 48000 Hz sample rate on Front DAC if supported
                outw(g_ac97_info.nam_base + AC97_REG_FRONT_DAC_RT, 48000);

                g_ac97_info.present = true;
                serial_printf("[AUDIO] AC'97 Audio Controller found at %02x:%02x.%d (NAM: 0x%x, NABM: 0x%x, IRQ: %u)\n",
                              0, dev, func, g_ac97_info.nam_base, g_ac97_info.nabm_base, g_ac97_info.irq);
                return true;
            }
        }
    }

    serial_printf("[AUDIO] No hardware AC'97 audio controller detected on PCI bus (PC Speaker available)\n");
    return false;
}

bool ac97_is_available(void) {
    return g_ac97_info.present;
}

const AC97DeviceInfo* ac97_get_info(void) {
    return &g_ac97_info;
}

void ac97_set_volume(uint8_t volume_percent) {
    if (volume_percent > 100) volume_percent = 100;
    g_ac97_info.master_volume = volume_percent;

    if (!g_ac97_info.present) return;

    // AC'97 Master Volume: 0 = 0dB (Max), 31 = -46.5dB (Min), bit 15 = Mute
    // Invert percentage to 5-bit attenuation
    uint8_t att = static_cast<uint8_t>((100 - volume_percent) * 31 / 100);
    uint16_t val = (static_cast<uint16_t>(att) << 8) | static_cast<uint16_t>(att);
    if (volume_percent == 0) {
        val |= 0x8000; // Mute
    }

    outw(g_ac97_info.nam_base + AC97_REG_MASTER_VOL, val);
    outw(g_ac97_info.nam_base + AC97_REG_PCM_OUT_VOL, val);
}

uint8_t ac97_get_volume(void) {
    return g_ac97_info.master_volume;
}

bool ac97_play_tone(uint32_t frequency_hz, uint32_t duration_ms) {
    if (!g_ac97_info.present) return false;
    UNUSED(frequency_hz);
    UNUSED(duration_ms);
    return true;
}

} // extern "C"
