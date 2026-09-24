#ifndef OXYGEN_FS_FAT32_H
#define OXYGEN_FS_FAT32_H

#include "types.h"

#pragma pack(push, 1)

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

#ifdef __cplusplus
extern "C" {
#endif

bool               fat32_init(uint8_t drive = 0);
bool               fat32_is_mounted(void);
const FAT32FSInfo* fat32_get_info(void);
size_t             fat32_read_file(const char* filename, uint8_t* buffer, size_t max_size);
void               fat32_mount_vfs(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_FS_FAT32_H
