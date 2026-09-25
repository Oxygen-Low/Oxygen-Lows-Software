#ifndef OXYGEN_FS_FAT32_H
#define OXYGEN_FS_FAT32_H

#include "types.h"

#pragma pack(push, 1)

struct MBRPartitionEntry {
    uint8_t  bootable;          // 0x80 = Active / Bootable
    uint8_t  start_chs[3];
    uint8_t  partition_type;    // 0x0B or 0x0C = FAT32
    uint8_t  end_chs[3];
    uint32_t start_lba;
    uint32_t sector_count;
};

struct MBRSector {
    uint8_t             bootstrap[446];
    MBRPartitionEntry   partitions[4];
    uint16_t            boot_signature; // 0x55AA
};

struct FAT32BootSector {
    uint8_t  jmp_boot[3];
    char     oem_name[8];
    uint16_t bytes_per_sector;
    uint8_t  sectors_per_cluster;
    uint16_t reserved_sectors;
    uint8_t  num_fats;
    uint16_t root_entry_count;
    uint16_t total_sectors_16;
    uint8_t  media_type;
    uint16_t fat_size_16;
    uint16_t sectors_per_track;
    uint16_t num_heads;
    uint32_t hidden_sectors;
    uint32_t total_sectors_32;
    uint32_t sectors_per_fat_32;
    uint16_t ext_flags;
    uint16_t fs_version;
    uint32_t root_cluster;
    uint16_t fs_info;
    uint16_t backup_boot_sector;
    uint8_t  reserved[12];
    uint8_t  drive_number;
    uint8_t  reserved1;
    uint8_t  boot_sig;
    uint32_t volume_id;
    char     volume_label[11];
    char     fs_type[8];
    uint8_t  boot_code[420];
    uint16_t boot_signature; // 0x55AA
};

struct FAT32DirectoryEntry {
    char     name[11];      // 8.3 filename
    uint8_t  attr;          // 0x01: Read-Only, 0x02: Hidden, 0x10: Subdirectory, 0x20: Archive
    uint8_t  nt_reserved;
    uint8_t  creation_time_tenth;
    uint16_t creation_time;
    uint16_t creation_date;
    uint16_t last_access_date;
    uint16_t first_cluster_high;
    uint16_t write_time;
    uint16_t write_date;
    uint16_t first_cluster_low;
    uint32_t file_size;
};

#pragma pack(pop)

struct FAT32FSInfo {
    bool     mounted;
    uint8_t  drive;
    uint32_t lba_start;
    uint16_t bytes_per_sector;
    uint8_t  sectors_per_cluster;
    uint16_t reserved_sectors;
    uint8_t  num_fats;
    uint32_t sectors_per_fat;
    uint32_t root_cluster;
    uint32_t first_data_sector;
    uint32_t total_sectors;
};

typedef void (*FAT32ProgressCallback)(const char* step_desc, int percent);

#ifdef __cplusplus
extern "C" {
#endif

bool               fat32_init(uint8_t drive = 0);
bool               fat32_is_mounted(void);
const FAT32FSInfo* fat32_get_info(void);
size_t             fat32_read_file(const char* filename, uint8_t* buffer, size_t max_size);
bool               fat32_write_file(const char* filename, const uint8_t* buffer, size_t size);
void               fat32_mount_vfs(void);

// Maintenance / Setup operations
bool               fat32_format_disk(uint8_t drive);
bool               fat32_install_system(uint8_t drive, FAT32ProgressCallback cb);
bool               fat32_update_system(uint8_t drive, FAT32ProgressCallback cb);
bool               fat32_verify_and_repair(uint8_t drive, FAT32ProgressCallback cb);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_FS_FAT32_H
