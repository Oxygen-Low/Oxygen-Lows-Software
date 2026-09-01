#ifndef OXYGEN_MM_VMM_H
#define OXYGEN_MM_VMM_H

#include "types.h"

// 64-bit Page Table Flags
#define PAGE_PRESENT       (1ULL << 0)
#define PAGE_WRITABLE      (1ULL << 1)
#define PAGE_USER          (1ULL << 2)
#define PAGE_WRITE_THROUGH (1ULL << 3)
#define PAGE_CACHE_DISABLE (1ULL << 4)
#define PAGE_ACCESSED      (1ULL << 5)
#define PAGE_DIRTY         (1ULL << 6)
#define PAGE_HUGE_2MB      (1ULL << 7)
#define PAGE_GLOBAL        (1ULL << 8)
#define PAGE_NO_EXECUTE    (1ULL << 63)

#define PAGE_FRAME_MASK    0x000FFFFFFFFFF000ULL

// Address Index Extractors (48-bit canonical virtual address)
#define VMM_PML4_INDEX(vaddr) (((vaddr) >> 39) & 0x1FF)
#define VMM_PDPT_INDEX(vaddr) (((vaddr) >> 30) & 0x1FF)
#define VMM_PD_INDEX(vaddr)   (((vaddr) >> 21) & 0x1FF)
#define VMM_PT_INDEX(vaddr)   (((vaddr) >> 12) & 0x1FF)
#define VMM_OFFSET(vaddr)     ((vaddr) & 0xFFF)

#ifdef __cplusplus
extern "C" {
#endif

void vmm_init(void);
bool vmm_map_page(uint64_t virt, uint64_t phys, uint64_t flags);
bool vmm_unmap_page(uint64_t virt);
uint64_t vmm_virt_to_phys(uint64_t virt);
void vmm_switch_pml4(uint64_t pml4_phys);
void vmm_invlpg(uint64_t virt);
uint64_t* vmm_get_kernel_pml4(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_MM_VMM_H
