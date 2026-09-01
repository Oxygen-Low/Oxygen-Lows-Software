#include "mm/pmm.h"
#include "boot/multiboot2.h"
#include "drivers/serial.h"

// External linker symbols for kernel boundaries
extern "C" uint8_t _kernel_start[];
extern "C" uint8_t _kernel_end[];

namespace {

// Maximum physical frames supported (4 GiB / 4 KiB = 1,048,576 frames)
#define PMM_MAX_FRAMES (1024 * 1024)
#define PMM_BITMAP_WORDS (PMM_MAX_FRAMES / 64)

alignas(4096) uint64_t g_pmm_bitmap[PMM_BITMAP_WORDS];

size_t g_total_frames = 0;
size_t g_free_frames = 0;
size_t g_used_frames = 0;
uint64_t g_highest_address = 0;

inline void pmm_set_bit(size_t frame) {
    if (frame < PMM_MAX_FRAMES) {
        g_pmm_bitmap[frame / 64] |= (1ULL << (frame % 64));
    }
}

inline void pmm_clear_bit(size_t frame) {
    if (frame < PMM_MAX_FRAMES) {
        g_pmm_bitmap[frame / 64] &= ~(1ULL << (frame % 64));
    }
}

inline bool pmm_test_bit(size_t frame) {
    if (frame >= PMM_MAX_FRAMES) return true;
    return (g_pmm_bitmap[frame / 64] & (1ULL << (frame % 64))) != 0;
}

void pmm_mark_region_free(uint64_t base, uint64_t length) {
    uint64_t start_frame = ALIGN_UP(base, PMM_PAGE_SIZE) / PMM_PAGE_SIZE;
    uint64_t end_frame = ALIGN_DOWN(base + length, PMM_PAGE_SIZE) / PMM_PAGE_SIZE;

    for (uint64_t f = start_frame; f < end_frame && f < PMM_MAX_FRAMES; ++f) {
        if (pmm_test_bit(f)) {
            pmm_clear_bit(f);
            g_free_frames++;
            if (g_used_frames > 0) g_used_frames--;
        }
    }
}

void pmm_mark_region_used(uint64_t base, uint64_t length) {
    uint64_t start_frame = ALIGN_DOWN(base, PMM_PAGE_SIZE) / PMM_PAGE_SIZE;
    uint64_t end_frame = ALIGN_UP(base + length, PMM_PAGE_SIZE) / PMM_PAGE_SIZE;

    for (uint64_t f = start_frame; f < end_frame && f < PMM_MAX_FRAMES; ++f) {
        if (!pmm_test_bit(f)) {
            pmm_set_bit(f);
            if (g_free_frames > 0) g_free_frames--;
            g_used_frames++;
        }
    }
}

} // anonymous namespace

extern "C" {

void pmm_init(uint64_t multiboot_info_addr) {
    // Initially mark all frames as used/reserved (all 1s)
    for (size_t i = 0; i < PMM_BITMAP_WORDS; ++i) {
        g_pmm_bitmap[i] = 0xFFFFFFFFFFFFFFFFULL;
    }
    g_total_frames = PMM_MAX_FRAMES;
    g_used_frames = PMM_MAX_FRAMES;
    g_free_frames = 0;

    bool mmap_found = false;

    if (multiboot_info_addr != 0) {
        Multiboot2Info* mbi = (Multiboot2Info*)multiboot_info_addr;
        uint8_t* ptr = (uint8_t*)multiboot_info_addr + sizeof(Multiboot2Info);
        uint8_t* end = (uint8_t*)multiboot_info_addr + mbi->total_size;

        while (ptr < end) {
            Multiboot2Tag* tag = (Multiboot2Tag*)ptr;
            if (tag->type == MULTIBOOT2_TAG_TYPE_END) {
                break;
            }

            if (tag->type == MULTIBOOT2_TAG_TYPE_MMAP) {
                mmap_found = true;
                Multiboot2MmapTag* mmap = (Multiboot2MmapTag*)tag;
                uint8_t* entry_ptr = (uint8_t*)mmap + sizeof(Multiboot2MmapTag);
                uint8_t* entry_end = ptr + tag->size;

                while (entry_ptr < entry_end) {
                    Multiboot2MmapEntry* entry = (Multiboot2MmapEntry*)entry_ptr;
                    if (entry->type == MULTIBOOT2_MEMORY_AVAILABLE) {
                        pmm_mark_region_free(entry->base_addr, entry->length);
                        if (entry->base_addr + entry->length > g_highest_address) {
                            g_highest_address = entry->base_addr + entry->length;
                        }
                    }
                    entry_ptr += mmap->entry_size;
                }
            }
            ptr += ALIGN_UP(tag->size, 8);
        }
    }

    // If no memory map tag was provided, default to marking 128MB available
    if (!mmap_found) {
        pmm_mark_region_free(0x100000, 128 * 1024 * 1024);
        g_highest_address = 128 * 1024 * 1024;
    }

    // 1. Reserve Lower 1MB (BIOS, Real Mode, VGA buffers)
    pmm_mark_region_used(0x00000000, 0x00100000);

    // 2. Reserve Kernel code/data sections (from 1MB to 16MB or kernel end)
    uint64_t kstart = 0x00100000;
    uint64_t kend = (uint64_t)_kernel_end;
    if (kend < 0x01000000) kend = 0x01000000; // Reserve at least first 16MB for kernel + tables
    pmm_mark_region_used(kstart, kend - kstart);

    // 3. Reserve Multiboot2 Info structure
    if (multiboot_info_addr != 0) {
        Multiboot2Info* mbi = (Multiboot2Info*)multiboot_info_addr;
        pmm_mark_region_used(multiboot_info_addr, mbi->total_size);
    }

    serial_printf("[PMM] Physical frame bitmap allocator initialized\n");
    serial_printf("[PMM] Total: %u MB | Free: %u MB | Used: %u MB\n",
        (uint32_t)(pmm_get_total_memory() / (1024 * 1024)),
        (uint32_t)(pmm_get_free_memory() / (1024 * 1024)),
        (uint32_t)(pmm_get_used_memory() / (1024 * 1024)));
}

uint64_t pmm_alloc_frame(void) {
    for (size_t i = 0; i < PMM_BITMAP_WORDS; ++i) {
        if (g_pmm_bitmap[i] != 0xFFFFFFFFFFFFFFFFULL) {
            uint64_t free_word = ~g_pmm_bitmap[i];
            int bit = __builtin_ctzll(free_word);
            size_t frame = i * 64 + bit;

            pmm_set_bit(frame);
            g_free_frames--;
            g_used_frames++;

            return frame * PMM_PAGE_SIZE;
        }
    }
    // Out of memory
    return 0;
}

uint64_t pmm_alloc_frames(size_t count) {
    if (count == 0) return 0;
    if (count == 1) return pmm_alloc_frame();

    size_t consecutive = 0;
    size_t start_frame = 0;

    for (size_t f = 0; f < PMM_MAX_FRAMES; ++f) {
        if (!pmm_test_bit(f)) {
            if (consecutive == 0) start_frame = f;
            consecutive++;
            if (consecutive == count) {
                for (size_t k = 0; k < count; ++k) {
                    pmm_set_bit(start_frame + k);
                }
                g_free_frames -= count;
                g_used_frames += count;
                return start_frame * PMM_PAGE_SIZE;
            }
        } else {
            consecutive = 0;
        }
    }
    return 0; // Not enough contiguous frames
}

void pmm_free_frame(uint64_t frame_addr) {
    size_t frame = frame_addr / PMM_PAGE_SIZE;
    if (frame < PMM_MAX_FRAMES && pmm_test_bit(frame)) {
        pmm_clear_bit(frame);
        g_free_frames++;
        g_used_frames--;
    }
}

void pmm_free_frames(uint64_t frame_addr, size_t count) {
    for (size_t i = 0; i < count; ++i) {
        pmm_free_frame(frame_addr + i * PMM_PAGE_SIZE);
    }
}

PMMStats pmm_get_stats(void) {
    PMMStats stats;
    stats.total_frames = g_total_frames;
    stats.free_frames = g_free_frames;
    stats.used_frames = g_used_frames;
    stats.total_memory_bytes = g_total_frames * PMM_PAGE_SIZE;
    stats.free_memory_bytes = g_free_frames * PMM_PAGE_SIZE;
    stats.used_memory_bytes = g_used_frames * PMM_PAGE_SIZE;
    return stats;
}

size_t pmm_get_total_memory(void) {
    return g_total_frames * PMM_PAGE_SIZE;
}

size_t pmm_get_free_memory(void) {
    return g_free_frames * PMM_PAGE_SIZE;
}

size_t pmm_get_used_memory(void) {
    return g_used_frames * PMM_PAGE_SIZE;
}

} // extern "C"
