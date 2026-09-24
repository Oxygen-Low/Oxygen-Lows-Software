#include "drivers/ata.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

// ATA I/O Registers
#define ATA_REG_DATA       0x00
#define ATA_REG_ERROR      0x01
#define ATA_REG_FEATURES   0x01
#define ATA_REG_SECCOUNT0  0x02
#define ATA_REG_LBA0       0x03
#define ATA_REG_LBA1       0x04
#define ATA_REG_LBA2       0x05
#define ATA_REG_HDDEVSEL   0x06
#define ATA_REG_COMMAND    0x07
#define ATA_REG_STATUS     0x07

// Status Bits
#define ATA_SR_BSY  0x80 // Busy
#define ATA_SR_DRDY 0x40 // Drive ready
#define ATA_SR_DF   0x20 // Drive write fault
#define ATA_SR_DSC  0x10 // Drive seek complete
#define ATA_SR_DRQ  0x08 // Data request ready
#define ATA_SR_CORR 0x04 // Corrected data
#define ATA_SR_IDX  0x02 // Index
#define ATA_SR_ERR  0x01 // Error

// Commands
#define ATA_CMD_READ_PIO        0x20
#define ATA_CMD_WRITE_PIO       0x30
#define ATA_CMD_CACHE_FLUSH     0xE7
#define ATA_CMD_IDENTIFY        0xEC
#define ATA_CMD_IDENTIFY_PACKET 0xA1

namespace {

struct ATABus {
    uint16_t io_base;
    uint16_t ctrl_base;
};

static const ATABus g_buses[2] = {
    { 0x1F0, 0x3F6 }, // Primary Bus
    { 0x170, 0x376 }  // Secondary Bus
};

static ATADriveInfo g_drives[4];

void ata_wait_400ns(uint16_t ctrl_base) {
    inb(ctrl_base);
    inb(ctrl_base);
    inb(ctrl_base);
    inb(ctrl_base);
}

uint8_t ata_wait_busy(uint16_t io_base) {
    uint8_t status;
    uint32_t timeout = 100000;
    while (((status = inb(io_base + ATA_REG_STATUS)) & ATA_SR_BSY) && --timeout) {
        __asm__ volatile("pause");
    }
    return status;
}

uint8_t ata_wait_drq(uint16_t io_base) {
    uint8_t status;
    uint32_t timeout = 100000;
    while (!((status = inb(io_base + ATA_REG_STATUS)) & (ATA_SR_DRQ | ATA_SR_ERR)) && --timeout) {
        __asm__ volatile("pause");
    }
    return status;
}

[[maybe_unused]] bool ata_select_drive(uint8_t drive) {
    uint8_t bus_idx = drive / 2;
    uint8_t slave   = drive % 2;
    uint16_t io_base = g_buses[bus_idx].io_base;

    // 0xE0 for Master (LBA mode), 0xF0 for Slave (LBA mode)
    outb(io_base + ATA_REG_HDDEVSEL, slave ? 0xF0 : 0xE0);
    ata_wait_400ns(g_buses[bus_idx].ctrl_base);
    return true;
}

void clean_ata_string(char* dest, const uint16_t* src, size_t word_count, size_t max_len) {
    size_t idx = 0;
    for (size_t i = 0; i < word_count && idx < max_len - 1; ++i) {
        // ATA words have byte pairs swapped
        char c1 = static_cast<char>((src[i] >> 8) & 0xFF);
        char c2 = static_cast<char>(src[i] & 0xFF);
        dest[idx++] = c1;
        if (idx < max_len - 1) dest[idx++] = c2;
    }
    dest[idx] = '\0';

    // Trim trailing spaces
    while (idx > 0 && dest[idx - 1] == ' ') {
        dest[--idx] = '\0';
    }
}

void identify_drive(uint8_t drive) {
    uint8_t bus_idx = drive / 2;
    uint8_t slave   = drive % 2;
    uint16_t io_base = g_buses[bus_idx].io_base;
    uint16_t ctrl_base = g_buses[bus_idx].ctrl_base;

    g_drives[drive].present = false;
    g_drives[drive].is_atapi = false;

    // Select target drive
    outb(io_base + ATA_REG_HDDEVSEL, slave ? 0xB0 : 0xA0);
    ata_wait_400ns(ctrl_base);

    outb(io_base + ATA_REG_SECCOUNT0, 0);
    outb(io_base + ATA_REG_LBA0, 0);
    outb(io_base + ATA_REG_LBA1, 0);
    outb(io_base + ATA_REG_LBA2, 0);

    // Send IDENTIFY command
    outb(io_base + ATA_REG_COMMAND, ATA_CMD_IDENTIFY);
    ata_wait_400ns(ctrl_base);

    uint8_t status = inb(io_base + ATA_REG_STATUS);
    if (status == 0) {
        return; // Drive does not exist
    }

    status = ata_wait_busy(io_base);

    // Check ATAPI signature
    uint8_t cl = inb(io_base + ATA_REG_LBA1);
    uint8_t ch = inb(io_base + ATA_REG_LBA2);
    if ((cl == 0x14 && ch == 0xEB) || (cl == 0x69 && ch == 0x96)) {
        g_drives[drive].is_atapi = true;
        // Send ATAPI IDENTIFY
        outb(io_base + ATA_REG_COMMAND, ATA_CMD_IDENTIFY_PACKET);
        ata_wait_400ns(ctrl_base);
    } else if (status & ATA_SR_ERR) {
        return;
    }

    status = ata_wait_drq(io_base);
    if (!(status & ATA_SR_DRQ)) {
        return;
    }

    uint16_t buffer[256];
    for (size_t i = 0; i < 256; ++i) {
        buffer[i] = inw(io_base + ATA_REG_DATA);
    }

    g_drives[drive].present = true;
    clean_ata_string(g_drives[drive].serial, &buffer[10], 10, sizeof(g_drives[drive].serial));
    clean_ata_string(g_drives[drive].model,  &buffer[27], 20, sizeof(g_drives[drive].model));

    uint32_t sectors = static_cast<uint32_t>(buffer[60]) | (static_cast<uint32_t>(buffer[61]) << 16);
    g_drives[drive].total_sectors = sectors;
    g_drives[drive].size_in_mb = sectors / 2048; // (sectors * 512) / (1024 * 1024)

    serial_printf("[ATA] Drive %u detected: '%s' (%u MB, %u sectors)%s\n",
                  drive, g_drives[drive].model, g_drives[drive].size_in_mb,
                  g_drives[drive].total_sectors, g_drives[drive].is_atapi ? " [ATAPI]" : "");
}

} // anonymous namespace

extern "C" {

void ata_init(void) {
    for (uint8_t i = 0; i < 4; ++i) {
        identify_drive(i);
    }
    serial_printf("[ATA] IDE/ATA PIO controller scan complete\n");
}

bool ata_is_drive_present(uint8_t drive) {
    if (drive >= 4) return false;
    return g_drives[drive].present;
}

const ATADriveInfo* ata_get_drive_info(uint8_t drive) {
    if (drive >= 4) return nullptr;
    return &g_drives[drive];
}

bool ata_read_sectors(uint8_t drive, uint32_t lba, uint8_t count, uint8_t* buffer) {
    if (drive >= 4 || !g_drives[drive].present || count == 0 || !buffer) {
        return false;
    }

    uint8_t bus_idx = drive / 2;
    uint8_t slave   = drive % 2;
    uint16_t io_base = g_buses[bus_idx].io_base;
    uint16_t ctrl_base = g_buses[bus_idx].ctrl_base;

    ata_wait_busy(io_base);

    // Select drive with highest 4 bits of LBA
    outb(io_base + ATA_REG_HDDEVSEL, (slave ? 0xF0 : 0xE0) | static_cast<uint8_t>((lba >> 24) & 0x0F));
    ata_wait_400ns(ctrl_base);

    outb(io_base + ATA_REG_SECCOUNT0, count);
    outb(io_base + ATA_REG_LBA0, static_cast<uint8_t>(lba & 0xFF));
    outb(io_base + ATA_REG_LBA1, static_cast<uint8_t>((lba >> 8) & 0xFF));
    outb(io_base + ATA_REG_LBA2, static_cast<uint8_t>((lba >> 16) & 0xFF));
    outb(io_base + ATA_REG_COMMAND, ATA_CMD_READ_PIO);

    auto* buf16 = reinterpret_cast<uint16_t*>(buffer);

    for (uint8_t s = 0; s < count; ++s) {
        uint8_t status = ata_wait_busy(io_base);
        if (status & (ATA_SR_ERR | ATA_SR_DF)) return false;

        status = ata_wait_drq(io_base);
        if (!(status & ATA_SR_DRQ)) return false;

        for (size_t i = 0; i < 256; ++i) {
            *buf16++ = inw(io_base + ATA_REG_DATA);
        }
    }

    return true;
}

bool ata_write_sectors(uint8_t drive, uint32_t lba, uint8_t count, const uint8_t* buffer) {
    if (drive >= 4 || !g_drives[drive].present || count == 0 || !buffer) {
        return false;
    }

    uint8_t bus_idx = drive / 2;
    uint8_t slave   = drive % 2;
    uint16_t io_base = g_buses[bus_idx].io_base;
    uint16_t ctrl_base = g_buses[bus_idx].ctrl_base;

    ata_wait_busy(io_base);

    outb(io_base + ATA_REG_HDDEVSEL, (slave ? 0xF0 : 0xE0) | static_cast<uint8_t>((lba >> 24) & 0x0F));
    ata_wait_400ns(ctrl_base);

    outb(io_base + ATA_REG_SECCOUNT0, count);
    outb(io_base + ATA_REG_LBA0, static_cast<uint8_t>(lba & 0xFF));
    outb(io_base + ATA_REG_LBA1, static_cast<uint8_t>((lba >> 8) & 0xFF));
    outb(io_base + ATA_REG_LBA2, static_cast<uint8_t>((lba >> 16) & 0xFF));
    outb(io_base + ATA_REG_COMMAND, ATA_CMD_WRITE_PIO);

    const auto* buf16 = reinterpret_cast<const uint16_t*>(buffer);

    for (uint8_t s = 0; s < count; ++s) {
        uint8_t status = ata_wait_busy(io_base);
        if (status & (ATA_SR_ERR | ATA_SR_DF)) return false;

        status = ata_wait_drq(io_base);
        if (!(status & ATA_SR_DRQ)) return false;

        for (size_t i = 0; i < 256; ++i) {
            outw(io_base + ATA_REG_DATA, *buf16++);
        }
    }

    // Flush ATA write cache
    outb(io_base + ATA_REG_COMMAND, ATA_CMD_CACHE_FLUSH);
    ata_wait_busy(io_base);

    return true;
}

} // extern "C"
