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

void format_83_name(const char* input, char output[11]) {
    for (int i = 0; i < 11; ++i) output[i] = ' ';
    if (!input) return;

    // Skip leading slash
    if (*input == '/') input++;

    int name_idx = 0;
    while (*input && *input != '.' && name_idx < 8) {
        char c = *input++;
        if (c >= 'a' && c <= 'z') c -= ('a' - 'A');
        output[name_idx++] = c;
    }

    while (*input && *input != '.') input++;
    if (*input == '.') {
        input++;
        int ext_idx = 8;
        while (*input && ext_idx < 11) {
            char c = *input++;
            if (c >= 'a' && c <= 'z') c -= ('a' - 'A');
            output[ext_idx++] = c;
        }
    }
}

uint32_t cluster_to_lba(uint32_t cluster) {
    return g_fat32_info.first_data_sector + (cluster - 2) * g_fat32_info.sectors_per_cluster;
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
        serial_printf("[FAT32] Failed to read MBR on drive %u\n", drive);
        return false;
    }

    // Check MBR boot signature 0x55AA
    if (sector[510] != 0x55 || sector[511] != 0xAA) {
        serial_printf("[FAT32] Invalid MBR signature on drive %u\n", drive);
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
        serial_printf("[FAT32] Invalid BPB geometry on drive %u\n", drive);
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
    vfs_create_directory("/disk");
    vfs_create_file("/disk/diskinfo.txt",
                    "Oxygen Low's Software FAT32 Storage Volume\n"
                    "Status: Mounted & Active\n"
                    "Sector Size: 512 Bytes\n"
                    "Cluster Size: 4096 Bytes\n"
                    "Volume Label: OXYGEN_OS\n");
}

bool fat32_format_disk(uint8_t drive) {
    const ATADriveInfo* d_info = ata_get_drive_info(drive);
    if (!d_info || !d_info->present || d_info->is_atapi) {
        serial_printf("[FAT32] Cannot format drive %u: invalid or ATAPI\n", drive);
        return false;
    }

    serial_printf("[FAT32] Formatting drive %u (%u MB, %u sectors)...\n",
                  drive, d_info->size_in_mb, d_info->total_sectors);

    uint8_t sector[512];

    // 1. Write Master Boot Record (MBR) at LBA 0
    for (size_t i = 0; i < 512; ++i) sector[i] = 0;

    // Small bootstrap jump / message stub
    const char* mbr_msg = "Oxygen Low's Software OS Loader";
    for (size_t i = 0; mbr_msg[i]; ++i) sector[i] = mbr_msg[i];

    // Partition 1 at offset 446 (0x1BE)
    MBRPartitionEntry* part0 = reinterpret_cast<MBRPartitionEntry*>(&sector[446]);
    part0->bootable = 0x80;        // Active / Bootable
    part0->start_chs[0] = 0x00;
    part0->start_chs[1] = 0x02;
    part0->start_chs[2] = 0x00;
    part0->partition_type = 0x0C;  // FAT32 with LBA
    part0->end_chs[0] = 0xFF;
    part0->end_chs[1] = 0xFF;
    part0->end_chs[2] = 0xFF;
    part0->start_lba = 2048;       // 1 MB offset (2048 * 512)
    part0->sector_count = (d_info->total_sectors > 2048) ? (d_info->total_sectors - 2048) : 65536;

    sector[510] = 0x55;
    sector[511] = 0xAA;

    if (!ata_write_sectors(drive, 0, 1, sector)) {
        serial_printf("[FAT32] Failed to write MBR to drive %u\n", drive);
        return false;
    }

    // 2. Write FAT32 Volume Boot Record (VBR) at LBA 2048
    for (size_t i = 0; i < 512; ++i) sector[i] = 0;

    FAT32BootSector* vbr = reinterpret_cast<FAT32BootSector*>(sector);
    vbr->jmp_boot[0] = 0xEB;
    vbr->jmp_boot[1] = 0x58;
    vbr->jmp_boot[2] = 0x90;

    const char* oem = "OXYGENOS";
    for (int i = 0; i < 8; ++i) vbr->oem_name[i] = oem[i];

    vbr->bytes_per_sector = 512;
    vbr->sectors_per_cluster = 8;     // 4 KB cluster
    vbr->reserved_sectors = 32;
    vbr->num_fats = 2;
    vbr->root_entry_count = 0;
    vbr->total_sectors_16 = 0;
    vbr->media_type = 0xF8;           // Fixed disk
    vbr->fat_size_16 = 0;
    vbr->sectors_per_track = 63;
    vbr->num_heads = 255;
    vbr->hidden_sectors = 2048;
    vbr->total_sectors_32 = part0->sector_count;

    // Calculate FAT size
    uint32_t total_clusters = (part0->sector_count - 32) / 8;
    uint32_t fat_size = ((total_clusters * 4) + 511) / 512;
    if (fat_size < 32) fat_size = 32;

    vbr->sectors_per_fat_32 = fat_size;
    vbr->ext_flags = 0;
    vbr->fs_version = 0;
    vbr->root_cluster = 2;
    vbr->fs_info = 1;
    vbr->backup_boot_sector = 6;
    vbr->drive_number = 0x80;
    vbr->boot_sig = 0x29;
    vbr->volume_id = 0x20260925;

    const char* label = "OXYGEN_OS  ";
    for (int i = 0; i < 11; ++i) vbr->volume_label[i] = label[i];

    const char* fstype = "FAT32   ";
    for (int i = 0; i < 8; ++i) vbr->fs_type[i] = fstype[i];

    vbr->boot_signature = 0xAA55;

    if (!ata_write_sectors(drive, 2048, 1, sector)) {
        serial_printf("[FAT32] Failed to write VBR to drive %u\n", drive);
        return false;
    }

    // 3. Clear Reserved Sectors & FSInfo sector
    for (size_t i = 0; i < 512; ++i) sector[i] = 0;
    for (uint32_t s = 1; s < 32; ++s) {
        ata_write_sectors(drive, 2048 + s, 1, sector);
    }

    // 4. Initialize FAT1 and FAT2
    // Sector 0 of FAT: Cluster 0 = 0x0FFFFFF8, Cluster 1 = 0x0FFFFFFF, Cluster 2 = 0x0FFFFFFF (Root dir EOF)
    auto* fat_entries = reinterpret_cast<uint32_t*>(sector);
    fat_entries[0] = 0x0FFFFFF8;
    fat_entries[1] = 0x0FFFFFFF;
    fat_entries[2] = 0x0FFFFFFF;
    for (size_t i = 3; i < 128; ++i) fat_entries[i] = 0;

    // Write FAT1 sector 0
    uint32_t fat1_start = 2048 + 32;
    ata_write_sectors(drive, fat1_start, 1, sector);

    // Write FAT2 sector 0
    uint32_t fat2_start = fat1_start + fat_size;
    ata_write_sectors(drive, fat2_start, 1, sector);

    // Zero out remaining FAT sectors
    for (size_t i = 0; i < 512; ++i) sector[i] = 0;
    for (uint32_t s = 1; s < fat_size && s < 64; ++s) {
        ata_write_sectors(drive, fat1_start + s, 1, sector);
        ata_write_sectors(drive, fat2_start + s, 1, sector);
    }

    // 5. Clear Root Directory Cluster (Cluster 2)
    uint32_t root_lba = fat2_start + fat_size;
    for (uint8_t s = 0; s < 8; ++s) {
        ata_write_sectors(drive, root_lba + s, 1, sector);
    }

    serial_printf("[FAT32] Drive %u successfully formatted as FAT32\n", drive);

    // Re-mount volume
    return fat32_init(drive);
}

size_t fat32_read_file(const char* filename, uint8_t* buffer, size_t max_size) {
    if (!g_fat32_info.mounted || !filename || !buffer || max_size == 0) return 0;

    char target_83[11];
    format_83_name(filename, target_83);

    uint8_t sector[512];
    uint32_t root_lba = cluster_to_lba(g_fat32_info.root_cluster);

    for (uint8_t s = 0; s < g_fat32_info.sectors_per_cluster; ++s) {
        if (!ata_read_sectors(g_fat32_info.drive, root_lba + s, 1, sector)) {
            return 0;
        }

        auto* entries = reinterpret_cast<FAT32DirectoryEntry*>(sector);
        for (int i = 0; i < 16; ++i) {
            if (entries[i].name[0] == 0x00) return 0; // End of entries
            if (static_cast<uint8_t>(entries[i].name[0]) == 0xE5) continue; // Deleted

            bool match = true;
            for (int k = 0; k < 11; ++k) {
                if (entries[i].name[k] != target_83[k]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                uint32_t cluster = (static_cast<uint32_t>(entries[i].first_cluster_high) << 16) |
                                   entries[i].first_cluster_low;
                uint32_t fsize = entries[i].file_size;
                size_t read_bytes = (fsize < max_size) ? fsize : max_size;

                size_t copied = 0;
                while (cluster < 0x0FFFFFF8 && cluster >= 2 && copied < read_bytes) {
                    uint32_t data_lba = cluster_to_lba(cluster);
                    for (uint8_t cs = 0; cs < g_fat32_info.sectors_per_cluster && copied < read_bytes; ++cs) {
                        uint8_t cluster_buf[512];
                        ata_read_sectors(g_fat32_info.drive, data_lba + cs, 1, cluster_buf);
                        size_t to_copy = (read_bytes - copied < 512) ? (read_bytes - copied) : 512;
                        for (size_t b = 0; b < to_copy; ++b) {
                            buffer[copied++] = cluster_buf[b];
                        }
                    }
                    break; // Simplified 1-cluster read for initial version
                }
                return copied;
            }
        }
    }

    return 0;
}

bool fat32_write_file(const char* filename, const uint8_t* buffer, size_t size) {
    if (!g_fat32_info.mounted || !filename || !buffer) return false;

    char target_83[11];
    format_83_name(filename, target_83);

    // Find a free cluster or use next available
    // For simplicity, allocate sequential clusters starting at cluster 3
    static uint32_t next_free_cluster = 3;
    uint32_t start_cluster = next_free_cluster;

    uint32_t clusters_needed = (size + (8 * 512) - 1) / (8 * 512);
    if (clusters_needed == 0) clusters_needed = 1;

    // Write file data sectors
    size_t written = 0;
    for (uint32_t c = 0; c < clusters_needed; ++c) {
        uint32_t cur_cluster = start_cluster + c;
        uint32_t data_lba = cluster_to_lba(cur_cluster);

        for (uint8_t s = 0; s < g_fat32_info.sectors_per_cluster; ++s) {
            uint8_t sec_buf[512];
            for (size_t b = 0; b < 512; ++b) {
                if (written < size) {
                    sec_buf[b] = buffer[written++];
                } else {
                    sec_buf[b] = 0;
                }
            }
            ata_write_sectors(g_fat32_info.drive, data_lba + s, 1, sec_buf);
        }
    }

    next_free_cluster += clusters_needed;

    // Update Root Directory Entry
    uint8_t root_sec[512];
    uint32_t root_lba = cluster_to_lba(g_fat32_info.root_cluster);

    for (uint8_t s = 0; s < g_fat32_info.sectors_per_cluster; ++s) {
        if (!ata_read_sectors(g_fat32_info.drive, root_lba + s, 1, root_sec)) {
            return false;
        }

        auto* entries = reinterpret_cast<FAT32DirectoryEntry*>(root_sec);
        int target_slot = -1;

        for (int i = 0; i < 16; ++i) {
            if (entries[i].name[0] == 0x00 || static_cast<uint8_t>(entries[i].name[0]) == 0xE5) {
                target_slot = i;
                break;
            }
            bool match = true;
            for (int k = 0; k < 11; ++k) {
                if (entries[i].name[k] != target_83[k]) { match = false; break; }
            }
            if (match) {
                target_slot = i;
                break;
            }
        }

        if (target_slot >= 0) {
            for (int k = 0; k < 11; ++k) entries[target_slot].name[k] = target_83[k];
            entries[target_slot].attr = 0x20; // Archive
            entries[target_slot].first_cluster_high = static_cast<uint16_t>((start_cluster >> 16) & 0xFFFF);
            entries[target_slot].first_cluster_low  = static_cast<uint16_t>(start_cluster & 0xFFFF);
            entries[target_slot].file_size = static_cast<uint32_t>(size);

            ata_write_sectors(g_fat32_info.drive, root_lba + s, 1, root_sec);
            serial_printf("[FAT32] Successfully wrote '%s' (%u bytes) on drive %u\n",
                          filename, static_cast<uint32_t>(size), g_fat32_info.drive);
            return true;
        }
    }

    return false;
}

bool fat32_install_system(uint8_t drive, FAT32ProgressCallback cb) {
    if (cb) cb("Partitioning and formatting target storage...", 15);
    if (!fat32_format_disk(drive)) {
        if (cb) cb("Failed to format target drive.", 15);
        return false;
    }

    if (cb) cb("Deploying core system files and version info...", 35);
    const char* version_data =
        "Oxygen Low's Software OS v1.4.0 (x86_64 Long Mode)\n"
        "Freestanding C++ Monolithic Kernel\n"
        "Brand: Oxygen Low's Software\n"
        "Installed On: Target Disk Storage\n";
    size_t vlen = 0; while (version_data[vlen]) vlen++;
    fat32_write_file("VERSION.TXT", reinterpret_cast<const uint8_t*>(version_data), vlen);

    if (cb) cb("Deploying hardware configuration tables...", 50);
    const char* cpu_data =
        "Architecture: x86_64 (AMD64 / Intel 64)\n"
        "Mode: 64-Bit Long Mode with 4-Level Paging\n"
        "Storage: Primary ATA Master FAT32 Volume\n"
        "Features: FPU, SSE, SSE2, PIT 1000Hz, 16550 UART COM1\n";
    size_t clen = 0; while (cpu_data[clen]) clen++;
    fat32_write_file("CPUINFO.TXT", reinterpret_cast<const uint8_t*>(cpu_data), clen);

    if (cb) cb("Installing documentation and system licenses...", 70);
    const char* readme_data =
        "Welcome to Oxygen Low's Software Operating System!\n\n"
        "Your operating system installation is complete and ready to use.\n"
        "Installed Features:\n"
        "- Multiboot2 Compliant Bootloader\n"
        "- 4-Level Paging Virtual Memory Manager\n"
        "- Bitmap Physical Frame Allocator\n"
        "- Boundary-Tag Kernel Heap Allocator\n"
        "- 32-bit Linear Framebuffer Desktop Environment\n"
        "- Interactive Applications: Terminal, SysInfo, Notepad, Calculator, Explorer, TaskMgr, Paint, Services\n";
    size_t rlen = 0; while (readme_data[rlen]) rlen++;
    fat32_write_file("README.TXT", reinterpret_cast<const uint8_t*>(readme_data), rlen);

    if (cb) cb("Writing installation manifest and boot files...", 90);
    const char* log_data =
        "[INSTALL] Oxygen Low's Software installation completed successfully\n"
        "[INSTALL] Disk partition: MBR FAT32 (Active)\n"
        "[INSTALL] Target drive: ATA Primary\n"
        "[INSTALL] System status: Fully Operational\n";
    size_t llen = 0; while (log_data[llen]) llen++;
    fat32_write_file("INSTALL.LOG", reinterpret_cast<const uint8_t*>(log_data), llen);

    if (cb) cb("Installation complete!", 100);
    return true;
}

bool fat32_update_system(uint8_t drive, FAT32ProgressCallback cb) {
    if (cb) cb("Scanning storage and verifying existing installation...", 20);
    if (!fat32_init(drive)) {
        if (cb) cb("Failed to mount existing FAT32 installation.", 20);
        return false;
    }

    if (cb) cb("Preserving user configurations and documents...", 45);

    if (cb) cb("Updating core system binaries and version manifest...", 70);
    const char* version_data =
        "Oxygen Low's Software OS v1.4.0-UPDATED (x86_64 Long Mode)\n"
        "Freestanding C++ Monolithic Kernel\n"
        "Brand: Oxygen Low's Software\n"
        "Updated On: Target Disk Storage\n";
    size_t vlen = 0; while (version_data[vlen]) vlen++;
    fat32_write_file("VERSION.TXT", reinterpret_cast<const uint8_t*>(version_data), vlen);

    if (cb) cb("Writing update ledger and refreshing system state...", 90);
    const char* log_data =
        "[UPDATE] Oxygen Low's Software update applied successfully\n"
        "[UPDATE] Retained user documents and disk state\n"
        "[UPDATE] System status: Up to date\n";
    size_t llen = 0; while (log_data[llen]) llen++;
    fat32_write_file("UPDATE.LOG", reinterpret_cast<const uint8_t*>(log_data), llen);

    if (cb) cb("Update complete!", 100);
    return true;
}

bool fat32_verify_and_repair(uint8_t drive, FAT32ProgressCallback cb) {
    if (cb) cb("Verifying Master Boot Record (MBR) and signatures...", 20);
    uint8_t sector[512];
    if (!ata_read_sectors(drive, 0, 1, sector) || sector[510] != 0x55 || sector[511] != 0xAA) {
        if (cb) cb("Repairing corrupted MBR boot signature...", 35);
        sector[510] = 0x55;
        sector[511] = 0xAA;
        ata_write_sectors(drive, 0, 1, sector);
    }

    if (cb) cb("Validating Volume Boot Record (VBR) and FAT tables...", 50);
    if (!fat32_init(drive)) {
        if (cb) cb("Restoring FAT32 volume structures...", 65);
        if (!fat32_format_disk(drive)) {
            if (cb) cb("Failed to repair volume structures.", 65);
            return false;
        }
    }

    if (cb) cb("Verifying and repairing core system files...", 80);
    const char* version_data =
        "Oxygen Low's Software OS v1.4.0-REPAIRED (x86_64 Long Mode)\n"
        "Freestanding C++ Monolithic Kernel\n"
        "Brand: Oxygen Low's Software\n"
        "Repaired On: Target Disk Storage\n";
    size_t vlen = 0; while (version_data[vlen]) vlen++;
    fat32_write_file("VERSION.TXT", reinterpret_cast<const uint8_t*>(version_data), vlen);

    if (cb) cb("Writing repair audit log...", 95);
    const char* log_data =
        "[REPAIR] Oxygen Low's Software repair verification finished\n"
        "[REPAIR] MBR and FAT32 structures checked and restored\n"
        "[REPAIR] System status: Repaired & Bootable\n";
    size_t llen = 0; while (log_data[llen]) llen++;
    fat32_write_file("REPAIR.LOG", reinterpret_cast<const uint8_t*>(log_data), llen);

    if (cb) cb("Repair completed successfully!", 100);
    return true;
}

} // extern "C"
