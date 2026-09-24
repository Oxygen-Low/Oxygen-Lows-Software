#ifndef OXYGEN_DRIVERS_ATA_H
#define OXYGEN_DRIVERS_ATA_H

#include "types.h"

#define ATA_SECTOR_SIZE 512

#define ATA_DRIVE_PRIMARY_MASTER   0
#define ATA_DRIVE_PRIMARY_SLAVE    1
#define ATA_DRIVE_SECONDARY_MASTER 2
#define ATA_DRIVE_SECONDARY_SLAVE  3

struct ATADriveInfo {
    bool     present;
    bool     is_atapi;
    char     model[41];
    char     serial[21];
    uint32_t total_sectors;
    uint32_t size_in_mb;
};

#ifdef __cplusplus
extern "C" {
#endif

void                ata_init(void);
bool                ata_is_drive_present(uint8_t drive);
const ATADriveInfo* ata_get_drive_info(uint8_t drive);
bool                ata_read_sectors(uint8_t drive, uint32_t lba, uint8_t count, uint8_t* buffer);
bool                ata_write_sectors(uint8_t drive, uint32_t lba, uint8_t count, const uint8_t* buffer);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_ATA_H
