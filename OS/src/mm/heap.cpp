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

} // anonymous namespace

extern "C" {

void heap_init(uint64_t start_addr, size_t initial_size) {
    UNUSED(start_addr);
    UNUSED(initial_size);

    g_heap_head = (HeapBlockHeader*)g_heap_pool;
    g_heap_head->magic = HEAP_MAGIC;
    g_heap_head->is_free = 1;
    g_heap_head->size = HEAP_STATIC_SIZE - sizeof(HeapBlockHeader);
    g_heap_head->next = nullptr;
    g_heap_head->prev = nullptr;

    g_heap_total_bytes = HEAP_STATIC_SIZE;
    g_heap_used_bytes = sizeof(HeapBlockHeader);

    serial_printf("[HEAP] Kernel heap allocator initialized\n");
    serial_printf("[HEAP] Pool size: %u MB at 0x%p\n",
        (uint32_t)(HEAP_STATIC_SIZE / (1024 * 1024)),
        (void*)g_heap_pool);
}

void* kmalloc(size_t size) {
    if (size == 0) {
        size = HEAP_MIN_ALLOC_SIZE;
    }
    size = ALIGN_UP(size, 16);

    HeapBlockHeader* curr = g_heap_head;
    while (curr) {
        if (curr->magic != HEAP_MAGIC) {
            serial_printf("[ERROR] Heap corruption detected in kmalloc!\n");
            return nullptr;
        }

        if (curr->is_free && curr->size >= size) {
            // Split block if excess space is available for another block header + payload
            if (curr->size >= size + sizeof(HeapBlockHeader) + HEAP_MIN_ALLOC_SIZE) {
                HeapBlockHeader* new_block = (HeapBlockHeader*)((uint8_t*)curr + sizeof(HeapBlockHeader) + size);
                new_block->magic = HEAP_MAGIC;
                new_block->is_free = 1;
                new_block->size = curr->size - size - sizeof(HeapBlockHeader);
                new_block->next = curr->next;
                new_block->prev = curr;

                if (curr->next) {
                    curr->next->prev = new_block;
                }
                curr->next = new_block;
                curr->size = size;

                g_heap_used_bytes += sizeof(HeapBlockHeader);
            }

            curr->is_free = 0;
            g_heap_used_bytes += curr->size;

            return (void*)((uint8_t*)curr + sizeof(HeapBlockHeader));
        }

        curr = curr->next;
    }

    serial_printf("[WARN] Kernel Heap Out of Memory (requested %u bytes)\n", (uint32_t)size);
    return nullptr;
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
        block->size += sizeof(HeapBlockHeader) + block->next->size;
        block->next = block->next->next;
        if (block->next) {
            block->next->prev = block;
        }
        g_heap_used_bytes -= sizeof(HeapBlockHeader);
    }

    // Coalesce with previous block if free
    if (block->prev && block->prev->is_free) {
        block->prev->size += sizeof(HeapBlockHeader) + block->size;
        block->prev->next = block->next;
        if (block->next) {
            block->next->prev = block->prev;
        }
        g_heap_used_bytes -= sizeof(HeapBlockHeader);
    }
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
