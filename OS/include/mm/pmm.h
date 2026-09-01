#ifndef OXYGEN_MM_PMM_H
#define OXYGEN_MM_PMM_H

#include "types.h"

#define PMM_PAGE_SIZE 4096ULL
#define PMM_PAGE_MASK (~(PMM_PAGE_SIZE - 1))

struct PMMStats {
    size_t total_frames;
    size_t free_frames;
    size_t used_frames;
    size_t total_memory_bytes;
    size_t free_memory_bytes;
    size_t used_memory_bytes;
};

#ifdef __cplusplus
extern "C" {
#endif

void pmm_init(uint64_t multiboot_info_addr);
uint64_t pmm_alloc_frame(void);
uint64_t pmm_alloc_frames(size_t count);
void pmm_free_frame(uint64_t frame_addr);
void pmm_free_frames(uint64_t frame_addr, size_t count);

PMMStats pmm_get_stats(void);
size_t pmm_get_total_memory(void);
size_t pmm_get_free_memory(void);
size_t pmm_get_used_memory(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_MM_PMM_H
