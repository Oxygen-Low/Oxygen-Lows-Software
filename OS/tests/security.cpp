#include "mm/heap.h"
#include "fs/fat32.h"
#include "drivers/ata.h"
#include "fs/vfs.h"
#include <cassert>
#include <cstring>
#include <vector>
#include <limits>

static std::vector<uint8_t> disk(65536 * 512);
static ATADriveInfo drive_info{true, false, {}, {}, 65536, 32};
static bool fail_read = false;
static uint32_t largest_lba = 0;
extern "C" {
void serial_printf(const char*, ...) {}
bool ata_is_drive_present(uint8_t) { return true; }
const ATADriveInfo* ata_get_drive_info(uint8_t) { return &drive_info; }
bool ata_read_sectors(uint8_t, uint32_t lba, uint8_t count, uint8_t* buffer) {
    largest_lba = lba > largest_lba ? lba : largest_lba;
    if (fail_read || lba >= 65536 || count > 65536 - lba) return false;
    std::memcpy(buffer, disk.data() + lba * 512, count * 512);
    return true;
}
bool ata_write_sectors(uint8_t, uint32_t lba, uint8_t count, const uint8_t* buffer) {
    if (lba >= 65536 || count > 65536 - lba) return false;
    std::memcpy(disk.data() + lba * 512, buffer, count * 512);
    return true;
}
}
int main() {
    heap_init(0, 0);
    auto* normal = kmalloc(128);
    assert(normal);
    assert(kmalloc(std::numeric_limits<size_t>::max()) == nullptr);
    assert(krealloc(normal, std::numeric_limits<size_t>::max()) == nullptr);
    kfree(normal);
    vfs_init();
    auto* file = vfs_create_file("/overflow.txt", "abc");
    uint8_t out[4] = {};
    assert(vfs_read(file, 1, std::numeric_limits<size_t>::max(), out) == 2);
    assert(vfs_write(file, std::numeric_limits<size_t>::max(), 1, out) == 0);
    assert(vfs_write(file, 1, std::numeric_limits<size_t>::max(), out) == 0);
    assert(fat32_format_disk(0));
    const uint8_t message[] = {1, 2, 3, 4};
    assert(fat32_write_file("TEST.TXT", message, sizeof(message)));
    uint8_t buffer[8] = {};
    assert(fat32_read_file("TEST.TXT", buffer, sizeof(buffer)) == sizeof(message));
    assert(std::memcmp(message, buffer, sizeof(message)) == 0);
    assert(!fat32_write_file("HUGE.TXT", message, std::numeric_limits<size_t>::max()));
    // Imported volumes remain read-only until a real FAT allocator exists.
    assert(fat32_init(0));
    assert(!fat32_write_file("NO.TXT", message, sizeof(message)));
    // Malicious root cluster must fail without reading outside the partition.
    uint32_t bad_cluster = 0xFFFFFFFE;
    std::memcpy(disk.data() + 2048 * 512 + 44, &bad_cluster, 4);
    largest_lba = 0;
    assert(!fat32_init(0));
    assert(largest_lba <= 2048);
    // Failed disk reads must not disclose uninitialized stack bytes.
    assert(fat32_format_disk(0));
    assert(fat32_write_file("TEST.TXT", message, sizeof(message)));
    fail_read = true;
    assert(fat32_read_file("TEST.TXT", buffer, sizeof(buffer)) == 0);
}
