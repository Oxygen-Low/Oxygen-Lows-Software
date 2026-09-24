#include "mm/heap.h"
#include "drivers/serial.h"

namespace {

// 16 MiB Static Kernel Heap Pool
#define HEAP_STATIC_SIZE (16 * 1024 * 1024)
alignas(16) uint8_t g_heap_pool[HEAP_STATIC_SIZE];

HeapBlockHeader* g_heap_head = nullptr;

size_t g_heap_total_bytes = 0;
size_t g_heap_used_bytes = 0;

void kernel_memset(void* dest, int val, size_t count) {
    uint8_t* d = (uint8_t*)dest;
    for (size_t i = 0; i < count; ++i) {
        d[i] = (uint8_t)val;
    }
}

void kernel_memcpy(void* dest, const void* src, size_t count) {
    uint8_t* d = (uint8_t*)dest;
    const uint8_t* s = (const uint8_t*)src;
    for (size_t i = 0; i < count; ++i) {
        d[i] = s[i];
    }
}

#define HEAP_NUM_BINS 11
static HeapBlockHeader* g_free_bins[HEAP_NUM_BINS] = { nullptr };

static inline size_t heap_get_bin_index(size_t size) {
    if (size <= 32) return 0;
    if (size <= 64) return 1;
    if (size <= 128) return 2;
    if (size <= 256) return 3;
    if (size <= 512) return 4;
    if (size <= 1024) return 5;
    if (size <= 2048) return 6;
    if (size <= 4096) return 7;
    if (size <= 8192) return 8;
    if (size <= 16384) return 9;
    return 10;
}

static void bin_insert(HeapBlockHeader* block) {
    size_t bin = heap_get_bin_index(block->size);
    block->free_prev = nullptr;
    block->free_next = g_free_bins[bin];
    if (g_free_bins[bin]) {
        g_free_bins[bin]->free_prev = block;
    }
    g_free_bins[bin] = block;
}

static void bin_remove(HeapBlockHeader* block) {
    size_t bin = heap_get_bin_index(block->size);
    if (block->free_prev) {
        block->free_prev->free_next = block->free_next;
    } else {
        if (g_free_bins[bin] == block) {
            g_free_bins[bin] = block->free_next;
        }
    }
    if (block->free_next) {
        block->free_next->free_prev = block->free_prev;
    }
    block->free_next = nullptr;
    block->free_prev = nullptr;
}

} // anonymous namespace

extern "C" {

void heap_init(uint64_t start_addr, size_t initial_size) {
    UNUSED(start_addr);
    UNUSED(initial_size);

    for (size_t i = 0; i < HEAP_NUM_BINS; ++i) {
        g_free_bins[i] = nullptr;
    }

    g_heap_head = (HeapBlockHeader*)g_heap_pool;
    g_heap_head->magic = HEAP_MAGIC;
    g_heap_head->is_free = 1;
    g_heap_head->size = HEAP_STATIC_SIZE - sizeof(HeapBlockHeader);
    g_heap_head->next = nullptr;
    g_heap_head->prev = nullptr;
    g_heap_head->free_next = nullptr;
    g_heap_head->free_prev = nullptr;

    g_heap_total_bytes = HEAP_STATIC_SIZE;
    g_heap_used_bytes = sizeof(HeapBlockHeader);

    bin_insert(g_heap_head);

    serial_printf("[HEAP] Kernel heap allocator initialized with segregated free lists\n");
    serial_printf("[HEAP] Pool size: %u MB at 0x%p\n",
        (uint32_t)(HEAP_STATIC_SIZE / (1024 * 1024)),
        (void*)g_heap_pool);
}

void* kmalloc(size_t size) {
    if (size == 0) {
        size = HEAP_MIN_ALLOC_SIZE;
    }
    size = ALIGN_UP(size, 16);

    size_t start_bin = heap_get_bin_index(size);
    HeapBlockHeader* curr = nullptr;

    // Search segregated bins starting from best-fit bin
    for (size_t b = start_bin; b < HEAP_NUM_BINS; ++b) {
        HeapBlockHeader* candidate = g_free_bins[b];
        while (candidate) {
            if (candidate->magic != HEAP_MAGIC) {
                serial_printf("[ERROR] Heap corruption detected in kmalloc!\n");
                return nullptr;
            }
            if (candidate->size >= size) {
                curr = candidate;
                break;
            }
            candidate = candidate->free_next;
        }
        if (curr) break;
    }

    if (!curr) {
        serial_printf("[WARN] Kernel Heap Out of Memory (requested %u bytes)\n", (uint32_t)size);
        return nullptr;
    }

    bin_remove(curr);

    // Split block if excess space is available
    if (curr->size >= size + sizeof(HeapBlockHeader) + HEAP_MIN_ALLOC_SIZE) {
        HeapBlockHeader* new_block = (HeapBlockHeader*)((uint8_t*)curr + sizeof(HeapBlockHeader) + size);
        new_block->magic = HEAP_MAGIC;
        new_block->is_free = 1;
        new_block->size = curr->size - size - sizeof(HeapBlockHeader);
        new_block->next = curr->next;
        new_block->prev = curr;
        new_block->free_next = nullptr;
        new_block->free_prev = nullptr;

        if (curr->next) {
            curr->next->prev = new_block;
        }
        curr->next = new_block;
        curr->size = size;

        g_heap_used_bytes += sizeof(HeapBlockHeader);
        bin_insert(new_block);
    }

    curr->is_free = 0;
    curr->free_next = nullptr;
    curr->free_prev = nullptr;
    g_heap_used_bytes += curr->size;

    return (void*)((uint8_t*)curr + sizeof(HeapBlockHeader));
}

void* kzalloc(size_t size) {
    void* ptr = kmalloc(size);
    if (ptr) {
        kernel_memset(ptr, 0, size);
    }
    return ptr;
}

void* kmalloc_aligned(size_t size, size_t alignment) {
    if (alignment <= 16) {
        return kmalloc(size);
    }

    // Allocate extra space for alignment adjustment + original pointer storage
    size_t total_size = size + alignment + sizeof(void*);
    void* raw_ptr = kmalloc(total_size);
    if (!raw_ptr) return nullptr;

    uintptr_t raw_addr = (uintptr_t)raw_ptr + sizeof(void*);
    uintptr_t aligned_addr = ALIGN_UP(raw_addr, alignment);

    // Store original pointer right before aligned address
    void** store_ptr = (void**)(aligned_addr - sizeof(void*));
    *store_ptr = raw_ptr;

    return (void*)aligned_addr;
}

void kfree(void* ptr) {
    if (!ptr) return;

    HeapBlockHeader* block = (HeapBlockHeader*)((uint8_t*)ptr - sizeof(HeapBlockHeader));
    if (block->magic != HEAP_MAGIC) {
        // Check if this was an aligned allocation created by kmalloc_aligned
        void* raw_candidate = *(void**)((uintptr_t)ptr - sizeof(void*));
        if (raw_candidate && raw_candidate < ptr) {
            HeapBlockHeader* candidate_block = (HeapBlockHeader*)((uint8_t*)raw_candidate - sizeof(HeapBlockHeader));
            if (candidate_block->magic == HEAP_MAGIC) {
                ptr = raw_candidate;
                block = candidate_block;
            }
        }
    }

    if (block->magic != HEAP_MAGIC) {
        serial_printf("[ERROR] Heap corruption detected on kfree(0x%p)!\n", ptr);
        return;
    }

    if (block->is_free) {
        serial_printf("[WARN] Double free detected on 0x%p!\n", ptr);
        return;
    }

    block->is_free = 1;
    g_heap_used_bytes -= block->size;

    // Coalesce with next block if free
    if (block->next && block->next->is_free) {
        bin_remove(block->next);
        block->size += sizeof(HeapBlockHeader) + block->next->size;
        block->next = block->next->next;
        if (block->next) {
            block->next->prev = block;
        }
        g_heap_used_bytes -= sizeof(HeapBlockHeader);
    }

    // Coalesce with previous block if free
    if (block->prev && block->prev->is_free) {
        HeapBlockHeader* prev_block = block->prev;
        bin_remove(prev_block);
        prev_block->size += sizeof(HeapBlockHeader) + block->size;
        prev_block->next = block->next;
        if (block->next) {
            block->next->prev = prev_block;
        }
        if (block == g_heap_head) {
            g_heap_head = prev_block;
        }
        g_heap_used_bytes -= sizeof(HeapBlockHeader);
        block = prev_block;
    }

    if (block->prev == nullptr) {
        g_heap_head = block;
    }

    // Insert coalesced free block into its appropriate segregated bin
    bin_insert(block);
}

void* krealloc(void* ptr, size_t new_size) {
    if (!ptr) {
        return kmalloc(new_size);
    }
    if (new_size == 0) {
        kfree(ptr);
        return nullptr;
    }

    HeapBlockHeader* block = (HeapBlockHeader*)((uint8_t*)ptr - sizeof(HeapBlockHeader));
    if (block->magic != HEAP_MAGIC) {
        serial_printf("[ERROR] Heap corruption in krealloc!\n");
        return nullptr;
    }

    if (block->size >= new_size) {
        return ptr;
    }

    void* new_ptr = kmalloc(new_size);
    if (!new_ptr) return nullptr;

    kernel_memcpy(new_ptr, ptr, block->size);
    kfree(ptr);
    return new_ptr;
}

size_t heap_get_used_bytes(void) {
    return g_heap_used_bytes;
}

size_t heap_get_free_bytes(void) {
    return (g_heap_total_bytes > g_heap_used_bytes) ? (g_heap_total_bytes - g_heap_used_bytes) : 0;
}

size_t heap_get_total_bytes(void) {
    return g_heap_total_bytes;
}

} // extern "C"
