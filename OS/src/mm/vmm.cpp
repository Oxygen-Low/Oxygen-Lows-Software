#include "mm/vmm.h"
#include "mm/pmm.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

alignas(4096) uint64_t g_kernel_pml4[512];
alignas(4096) uint64_t g_kernel_pdpt_low[512];
alignas(4096) uint64_t g_kernel_pdpt_high[512];
alignas(4096) uint64_t g_kernel_pd[512];

uint64_t* get_or_create_table(uint64_t* parent_entry, uint64_t flags) {
    if (*parent_entry & PAGE_PRESENT) {
        // Table already present, return pointer
        return (uint64_t*)(*parent_entry & PAGE_FRAME_MASK);
    }

    // Allocate new physical frame for page table
    uint64_t new_table_phys = pmm_alloc_frame();
    if (!new_table_phys) {
        return nullptr;
    }

    // Zero out the newly allocated page table
    uint64_t* new_table = (uint64_t*)new_table_phys;
    for (size_t i = 0; i < 512; ++i) {
        new_table[i] = 0;
    }

    // Link into parent entry
    *parent_entry = new_table_phys | PAGE_PRESENT | PAGE_WRITABLE | (flags & PAGE_USER);
    return new_table;
}

} // anonymous namespace

extern "C" {

void vmm_init(void) {
    // Zero all early tables
    for (size_t i = 0; i < 512; ++i) {
        g_kernel_pml4[i] = 0;
        g_kernel_pdpt_low[i] = 0;
        g_kernel_pdpt_high[i] = 0;
        g_kernel_pd[i] = 0;
    }

    // 1. Identity map lower 1GB using 512 x 2MB huge pages (PML4[0])
    g_kernel_pml4[0] = ((uint64_t)&g_kernel_pdpt_low) | PAGE_PRESENT | PAGE_WRITABLE;
    g_kernel_pdpt_low[0] = ((uint64_t)&g_kernel_pd) | PAGE_PRESENT | PAGE_WRITABLE;

    for (size_t i = 0; i < 512; ++i) {
        g_kernel_pd[i] = (i * 0x200000ULL) | PAGE_PRESENT | PAGE_WRITABLE | PAGE_HUGE_2MB;
    }

    // 2. Map higher-half kernel space (PML4[511], PDPT_HIGH[510]) to lower 1GB
    // Virtual 0xFFFFFFFF80000000 -> Physical 0x00000000
    g_kernel_pml4[511] = ((uint64_t)&g_kernel_pdpt_high) | PAGE_PRESENT | PAGE_WRITABLE;
    g_kernel_pdpt_high[510] = ((uint64_t)&g_kernel_pd) | PAGE_PRESENT | PAGE_WRITABLE;

    // Load newly initialized PML4 into CR3
    write_cr3((uint64_t)&g_kernel_pml4);

    serial_printf("[VMM] 4-level paging initialized\n");
}

bool vmm_map_page(uint64_t virt, uint64_t phys, uint64_t flags) {
    virt = ALIGN_DOWN(virt, PMM_PAGE_SIZE);
    phys = ALIGN_DOWN(phys, PMM_PAGE_SIZE);

    size_t pml4_idx = VMM_PML4_INDEX(virt);
    size_t pdpt_idx = VMM_PDPT_INDEX(virt);
    size_t pd_idx   = VMM_PD_INDEX(virt);
    size_t pt_idx   = VMM_PT_INDEX(virt);

    uint64_t* pml4 = g_kernel_pml4;

    uint64_t* pdpt = get_or_create_table(&pml4[pml4_idx], flags);
    if (!pdpt) return false;

    uint64_t* pd = get_or_create_table(&pdpt[pdpt_idx], flags);
    if (!pd) return false;

    // If PD is currently mapped as a 2MB huge page, we cannot split it directly without breaking existing map
    if (pd[pd_idx] & PAGE_HUGE_2MB) {
        // Already mapped via 2MB page
        return true;
    }

    uint64_t* pt = get_or_create_table(&pd[pd_idx], flags);
    if (!pt) return false;

    // Set page table entry
    pt[pt_idx] = phys | flags | PAGE_PRESENT;

    // Invalidate TLB for this virtual address
    vmm_invlpg(virt);

    return true;
}

bool vmm_unmap_page(uint64_t virt) {
    virt = ALIGN_DOWN(virt, PMM_PAGE_SIZE);

    size_t pml4_idx = VMM_PML4_INDEX(virt);
    size_t pdpt_idx = VMM_PDPT_INDEX(virt);
    size_t pd_idx   = VMM_PD_INDEX(virt);
    size_t pt_idx   = VMM_PT_INDEX(virt);

    uint64_t* pml4 = g_kernel_pml4;
    if (!(pml4[pml4_idx] & PAGE_PRESENT)) return false;

    uint64_t* pdpt = (uint64_t*)(pml4[pml4_idx] & PAGE_FRAME_MASK);
    if (!(pdpt[pdpt_idx] & PAGE_PRESENT)) return false;

    uint64_t* pd = (uint64_t*)(pdpt[pdpt_idx] & PAGE_FRAME_MASK);
    if (!(pd[pd_idx] & PAGE_PRESENT)) return false;

    if (pd[pd_idx] & PAGE_HUGE_2MB) {
        // Cannot unmap sub-page of huge page
        return false;
    }

    uint64_t* pt = (uint64_t*)(pd[pd_idx] & PAGE_FRAME_MASK);
    if (!(pt[pt_idx] & PAGE_PRESENT)) return false;

    pt[pt_idx] = 0;
    vmm_invlpg(virt);

    return true;
}

uint64_t vmm_virt_to_phys(uint64_t virt) {
    size_t pml4_idx = VMM_PML4_INDEX(virt);
    size_t pdpt_idx = VMM_PDPT_INDEX(virt);
    size_t pd_idx   = VMM_PD_INDEX(virt);
    size_t pt_idx   = VMM_PT_INDEX(virt);

    uint64_t* pml4 = g_kernel_pml4;
    if (!(pml4[pml4_idx] & PAGE_PRESENT)) return 0;

    uint64_t* pdpt = (uint64_t*)(pml4[pml4_idx] & PAGE_FRAME_MASK);
    if (!(pdpt[pdpt_idx] & PAGE_PRESENT)) return 0;

    uint64_t* pd = (uint64_t*)(pdpt[pdpt_idx] & PAGE_FRAME_MASK);
    if (!(pd[pd_idx] & PAGE_PRESENT)) return 0;

    if (pd[pd_idx] & PAGE_HUGE_2MB) {
        return (pd[pd_idx] & PAGE_FRAME_MASK) + (virt & 0x1FFFFF);
    }

    uint64_t* pt = (uint64_t*)(pd[pd_idx] & PAGE_FRAME_MASK);
    if (!(pt[pt_idx] & PAGE_PRESENT)) return 0;

    return (pt[pt_idx] & PAGE_FRAME_MASK) + (virt & 0xFFF);
}

void vmm_switch_pml4(uint64_t pml4_phys) {
    write_cr3(pml4_phys);
}

void vmm_invlpg(uint64_t virt) {
    invlpg_asm(virt);
}

uint64_t* vmm_get_kernel_pml4(void) {
    return g_kernel_pml4;
}

} // extern "C"
