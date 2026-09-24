#include "arch/x86_64/acpi.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

bool g_acpi_initialized = false;
RSDPDescriptor* g_rsdp = nullptr;
ACPITableHeader* g_rsdt = nullptr;
FADTTable* g_fadt = nullptr;

uint32_t g_pm1a_cnt = 0;
uint32_t g_pm1b_cnt = 0;
uint16_t g_slp_typa = 5; // VirtualBox / QEMU PIIX4 default
uint16_t g_slp_typb = 5;

bool mem_compare(const void* s1, const void* s2, size_t n) {
    const auto* p1 = reinterpret_cast<const uint8_t*>(s1);
    const auto* p2 = reinterpret_cast<const uint8_t*>(s2);
    for (size_t i = 0; i < n; ++i) {
        if (p1[i] != p2[i]) return false;
    }
    return true;
}

bool acpi_validate_checksum(const void* ptr, size_t length) {
    const auto* bytes = reinterpret_cast<const uint8_t*>(ptr);
    uint8_t sum = 0;
    for (size_t i = 0; i < length; ++i) {
        sum = (uint8_t)(sum + bytes[i]);
    }
    return (sum == 0);
}

RSDPDescriptor* acpi_find_rsdp(void) {
    // 1. Search Extended BIOS Data Area (EBDA)
    auto* ebda_ptr = reinterpret_cast<const uint16_t*>(0x40E);
    uint32_t ebda_addr = static_cast<uint32_t>(*ebda_ptr) << 4;
    if (ebda_addr >= 0x80000 && ebda_addr < 0xA0000) {
        for (uint32_t addr = ebda_addr; addr < ebda_addr + 1024; addr += 16) {
            auto* candidate = reinterpret_cast<RSDPDescriptor*>(addr);
            if (mem_compare(candidate->signature, "RSD PTR ", 8)) {
                if (acpi_validate_checksum(candidate, sizeof(RSDPDescriptor))) {
                    return candidate;
                }
            }
        }
    }

    // 2. Search main BIOS ROM memory space (0xE0000 to 0xFFFFF)
    for (uint32_t addr = 0x000E0000; addr < 0x00100000; addr += 16) {
        auto* candidate = reinterpret_cast<RSDPDescriptor*>(addr);
        if (mem_compare(candidate->signature, "RSD PTR ", 8)) {
            if (acpi_validate_checksum(candidate, sizeof(RSDPDescriptor))) {
                return candidate;
            }
        }
    }

    return nullptr;
}

void acpi_parse_dsdt_s5(ACPITableHeader* dsdt) {
    if (!dsdt) return;

    const char* s5_sig = "_S5_";
    const auto* data = reinterpret_cast<const uint8_t*>(dsdt);
    size_t len = dsdt->length;

    for (size_t i = sizeof(ACPITableHeader); i < len - 8; ++i) {
        if (mem_compare(&data[i], s5_sig, 4)) {
            // Found _S5_ object. Check for AML NameOp (0x08) preceding it
            // Syntax: 08 [Name] 12 [PkgLength] [NumElements] [Elements...]
            size_t pkg_idx = i + 4;
            if (data[pkg_idx] == 0x12) { // PackageOp
                pkg_idx++; // Skip package op
                // Skip pkglength byte(s)
                uint8_t pkg_len_lead = data[pkg_idx];
                uint8_t byte_count = (pkg_len_lead >> 6) & 0x03;
                pkg_idx += (1 + byte_count);
                pkg_idx++; // Skip NumElements

                // First element: SLP_TYPa
                if (data[pkg_idx] == 0x0A) { // Byte prefix
                    g_slp_typa = data[pkg_idx + 1];
                    pkg_idx += 2;
                } else if (data[pkg_idx] == 0x00) { // ZeroOp
                    g_slp_typa = 0;
                    pkg_idx++;
                } else if (data[pkg_idx] == 0x01) { // OneOp
                    g_slp_typa = 1;
                    pkg_idx++;
                }

                // Second element: SLP_TYPb
                if (data[pkg_idx] == 0x0A) {
                    g_slp_typb = data[pkg_idx + 1];
                } else if (data[pkg_idx] == 0x00) {
                    g_slp_typb = 0;
                } else if (data[pkg_idx] == 0x01) {
                    g_slp_typb = 1;
                }

                serial_printf("[ACPI] DSDT _S5_ parsed: SLP_TYPa=0x%02x SLP_TYPb=0x%02x\n",
                              g_slp_typa, g_slp_typb);
                return;
            }
        }
    }

    serial_printf("[ACPI] DSDT _S5_ using standard PIIX4 values (0x05)\n");
}

} // anonymous namespace

extern "C" {

ACPITableHeader* acpi_find_table(const char* signature) {
    if (!g_rsdt || !signature) return nullptr;

    size_t entries = (g_rsdt->length - sizeof(ACPITableHeader)) / sizeof(uint32_t);
    const auto* table_ptrs = reinterpret_cast<const uint32_t*>(
        reinterpret_cast<uintptr_t>(g_rsdt) + sizeof(ACPITableHeader)
    );

    for (size_t i = 0; i < entries; ++i) {
        auto* table = reinterpret_cast<ACPITableHeader*>((uintptr_t)table_ptrs[i]);
        if (table && mem_compare(table->signature, signature, 4)) {
            if (acpi_validate_checksum(table, table->length)) {
                return table;
            }
        }
    }

    return nullptr;
}

bool acpi_init(void) {
    g_rsdp = acpi_find_rsdp();
    if (!g_rsdp) {
        serial_printf("[ACPI] RSDP structure not found in memory\n");
        return false;
    }

    serial_printf("[ACPI] RSDP located at 0x%p (OEM: %.6s, Rev: %u)\n",
                  reinterpret_cast<void*>(g_rsdp), g_rsdp->oem_id, g_rsdp->revision);

    g_rsdt = reinterpret_cast<ACPITableHeader*>((uintptr_t)g_rsdp->rsdt_address);
    if (!g_rsdt || !acpi_validate_checksum(g_rsdt, g_rsdt->length)) {
        serial_printf("[ACPI] RSDT checksum validation failed\n");
        return false;
    }

    serial_printf("[ACPI] RSDT located at 0x%p (Len: %u bytes)\n",
                  reinterpret_cast<void*>(g_rsdt), g_rsdt->length);

    // Locate FADT (Fixed ACPI Description Table)
    auto* fadt_hdr = acpi_find_table("FACP");
    if (fadt_hdr) {
        g_fadt = reinterpret_cast<FADTTable*>(fadt_hdr);
        g_pm1a_cnt = g_fadt->pm1a_cnt_blk;
        g_pm1b_cnt = g_fadt->pm1b_cnt_blk;

        serial_printf("[ACPI] FADT located: PM1a_CNT=0x%04x, PM1b_CNT=0x%04x, SMI_CMD=0x%04x\n",
                      g_pm1a_cnt, g_pm1b_cnt, g_fadt->smi_cmd);

        // Enable ACPI mode if currently in legacy hardware mode
        if (g_pm1a_cnt != 0 && (inw((uint16_t)g_pm1a_cnt) & 0x01) == 0) {
            if (g_fadt->smi_cmd != 0 && g_fadt->acpi_enable != 0) {
                outb((uint16_t)g_fadt->smi_cmd, g_fadt->acpi_enable);
                // Wait for SCI_EN (bit 0) to be set by hardware
                uint32_t timeout = 300000;
                while (--timeout && (inw((uint16_t)g_pm1a_cnt) & 0x01) == 0) {
                    io_wait();
                }
                if (inw((uint16_t)g_pm1a_cnt) & 0x01) {
                    serial_printf("[ACPI] ACPI mode enabled successfully\n");
                } else {
                    serial_printf("[ACPI] Warning: ACPI mode enable timed out\n");
                }
            }
        }

        // Parse DSDT for _S5_ sleep state
        if (g_fadt->dsdt != 0) {
            auto* dsdt = reinterpret_cast<ACPITableHeader*>((uintptr_t)g_fadt->dsdt);
            acpi_parse_dsdt_s5(dsdt);
        }
    }

    g_acpi_initialized = true;
    serial_printf("[ACPI] ACPI subsystem initialized\n");
    return true;
}

bool acpi_is_available(void) {
    return g_acpi_initialized;
}

void acpi_poweroff(void) {
    serial_printf("[ACPI] Initiating clean guest poweroff & shutdown...\n");

    cli();

    // 1. ACPI Sleep Control Register (S5 state)
    if (g_pm1a_cnt != 0) {
        uint16_t val = (uint16_t)((g_slp_typa << 10) | (1 << 13)); // SLP_EN bit 13
        outw((uint16_t)g_pm1a_cnt, val);
        if (g_pm1b_cnt != 0) {
            outw((uint16_t)g_pm1b_cnt, (uint16_t)((g_slp_typb << 10) | (1 << 13)));
        }
    }

    // 2. VirtualBox PIIX4 ACPI PM1a block shutdown fallback
    outw(0x4004, 0x3400);

    // 3. QEMU / Bochs ACPI shutdown fallback
    outw(0x0604, 0x2000);

    // 4. Legacy Bochs ACPI shutdown fallback
    outw(0xB004, 0x2000);

    serial_printf("[ACPI] Poweroff signal dispatched; entering halt loop.\n");

    // 5. Triple fault reset fallback if poweroff was ignored
    struct __attribute__((packed)) {
        uint16_t limit;
        uint64_t base;
    } null_idt = { 0, 0 };
    __asm__ volatile ("lidt %0" : : "m"(null_idt));
    __asm__ volatile ("int3");

    while (true) {
        hlt();
    }
}

void acpi_reboot(void) {
    serial_printf("[ACPI] Initiating clean guest reboot...\n");

    cli();

    // 1. 8042 Keyboard Controller Pulse Reset
    uint32_t timeout = 10000;
    while (timeout-- && (inb(0x64) & 0x02)) {
        io_wait();
    }
    outb(0x64, 0xFE);

    // 2. PCI Reset Register (Port 0xCF9)
    outb(0xCF9, 0x02);
    io_wait();
    outb(0xCF9, 0x06);

    // 3. Triple fault fallback
    struct __attribute__((packed)) {
        uint16_t limit;
        uint64_t base;
    } null_idt = { 0, 0 };
    __asm__ volatile ("lidt %0" : : "m"(null_idt));
    __asm__ volatile ("int3");

    while (true) {
        hlt();
    }
}

} // extern "C"
