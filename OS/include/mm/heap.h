#ifndef OXYGEN_MM_HEAP_H
#define OXYGEN_MM_HEAP_H

#include "types.h"

#define HEAP_MAGIC 0xDEADBEEF
#define HEAP_MIN_ALLOC_SIZE 16

#pragma pack(push, 1)

struct HeapBlockHeader {
    uint32_t magic;              // HEAP_MAGIC validation marker
    uint32_t is_free;            // 1 if free block, 0 if allocated
    size_t   size;               // Size of usable payload in bytes
    HeapBlockHeader* next;       // Next block in physical layout
    HeapBlockHeader* prev;       // Previous block in physical layout
};

#pragma pack(pop)

#ifdef __cplusplus
extern "C" {
#endif

void  heap_init(uint64_t start_addr = 0xFFFFFFFF90000000ULL, size_t initial_size = 16 * 1024 * 1024);
void* kmalloc(size_t size);
void* kzalloc(size_t size);
void* kmalloc_aligned(size_t size, size_t alignment);
void  kfree(void* ptr);
void* krealloc(void* ptr, size_t new_size);

size_t heap_get_used_bytes(void);
size_t heap_get_free_bytes(void);
size_t heap_get_total_bytes(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_MM_HEAP_H
