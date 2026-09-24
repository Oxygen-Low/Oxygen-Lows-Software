#include "fs/fat32.h"
#include "drivers/ata.h"
#include "fs/vfs.h"
#include "mm/heap.h"
#include "drivers/serial.h"

namespace {

static FAT32FSInfo g_fat32_info = { false, 0, 0, 512, 8, 32, 2, 0, 2, 0, 0 };

bool str_equals_case(const char* s1, const char* s2) {
    if (!s1 || !s2) return false;
    while (*s1 && *s2) {
        char c1 = *s1;
        char c2 = *s2;
        if (c1 >= 'a' && c1 <= 'z') c1 -= ('a' - 'A');
        if (c2 >= 'a' && c2 <= 'z') c2 -= ('a' - 'A');
        if (c1 != c2) return false;
        s1++;
        s2++;
    }
    return *s1 == *s2;
}

} // anonymous namespace

extern "C" {

bool fat32_init(uint8_t drive) {
    g_fat32_info.mounted = false;
    g_fat32_info.drive = drive;

    if (!ata_is_drive_present(drive)) {
        serial_printf("[FAT32] Drive %u is not present\n", drive);
        return false;
    }

    uint8_t sector[512];
    // Read MBR (LBA 0)
    if (!ata_read_sectors(drive, 0, 1, sector)) {
        serial_printf("[FAT32] Failed to read MBR\n");
        return false;
    }

    // Check MBR boot signature 0x55AA
    if (sector[510] != 0x55 || sector[511] != 0xAA) {
        serial_printf("[FAT32] Invalid MBR signature\n");
        return false;
    }

    uint32_t partition_lba = 0;
    bool found_fat32 = false;

    // Scan 4 partition entries (starting at offset 446)
    for (int i = 0; i < 4; ++i) {
        int entry = 446 + (i * 16);
        uint8_t type = sector[entry + 4];
        if (type == 0x0B || type == 0x0C) { // FAT32 with CHS or LBA
            partition_lba = *reinterpret_cast<uint32_t*>(&sector[entry + 8]);
            found_fat32 = true;
            break;
        }
    }

    // If no MBR partition table, check if LBA 0 is directly a VBR / Superfloppy
    if (!found_fat32) {
        if (sector[66] == 0x29 || sector[38] == 0x29) {
            partition_lba = 0;
            found_fat32 = true;
        }
    }

    if (!found_fat32) {
        serial_printf("[FAT32] No FAT32 partition found on drive %u\n", drive);
        return false;
    }

    // Read Volume Boot Record (VBR)
    if (!ata_read_sectors(drive, partition_lba, 1, sector)) {
        serial_printf("[FAT32] Failed to read VBR at LBA %u\n", partition_lba);
        return false;
    }

    g_fat32_info.lba_start           = partition_lba;
    g_fat32_info.bytes_per_sector    = *reinterpret_cast<uint16_t*>(&sector[11]);
    g_fat32_info.sectors_per_cluster = sector[13];
    g_fat32_info.reserved_sectors    = *reinterpret_cast<uint16_t*>(&sector[14]);
    g_fat32_info.num_fats            = sector[16];
    g_fat32_info.sectors_per_fat     = *reinterpret_cast<uint32_t*>(&sector[36]);
    g_fat32_info.root_cluster        = *reinterpret_cast<uint32_t*>(&sector[44]);

    if (g_fat32_info.bytes_per_sector != 512 || g_fat32_info.sectors_per_cluster == 0) {
        serial_printf("[FAT32] Invalid BPB geometry\n");
        return false;
    }

    g_fat32_info.first_data_sector = g_fat32_info.lba_start +
                                     g_fat32_info.reserved_sectors +
                                     (g_fat32_info.num_fats * g_fat32_info.sectors_per_fat);

    g_fat32_info.mounted = true;
    serial_printf("[FAT32] Mounted FAT32 volume on drive %u (Root Cluster: %u, Data Sector: %u)\n",
                  drive, g_fat32_info.root_cluster, g_fat32_info.first_data_sector);

    fat32_mount_vfs();
    return true;
}

bool fat32_is_mounted(void) {
    return g_fat32_info.mounted;
}

const FAT32FSInfo* fat32_get_info(void) {
    return &g_fat32_info;
}

void fat32_mount_vfs(void) {
    // Expose mounted drive under VFS directory /disk
    vfs_create_directory("/disk");
    vfs_create_file("/disk/diskinfo.txt",
                    "Oxygen Low's Software FAT32 Storage Driver\n"
                    "Status: Mounted & Active\n"
                    "Sector Size: 512 Bytes\n");
}

size_t fat32_read_file(const char* filename, uint8_t* buffer, size_t max_size) {
    if (!g_fat32_info.mounted || !filename || !buffer || max_size == 0) return 0;
    UNUSED(filename);
    UNUSED(buffer);
    UNUSED(max_size);
    return 0;
}

} // extern "C"
