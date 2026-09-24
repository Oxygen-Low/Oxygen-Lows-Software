#ifndef OXYGEN_ARCH_ACPI_H
#define OXYGEN_ARCH_ACPI_H

#include "types.h"

// ACPI Generic Address Structure (GAS)
struct __attribute__((packed)) ACPI_GAS {
    uint8_t  address_space;
    uint8_t  bit_width;
    uint8_t  bit_offset;
    uint8_t  access_size;
    uint64_t address;
};

// ACPI Standard Description Table Header
struct __attribute__((packed)) ACPITableHeader {
    char     signature[4];
    uint32_t length;
    uint8_t  revision;
    uint8_t  checksum;
    char     oem_id[6];
    char     oem_table_id[8];
    uint32_t oem_revision;
    uint32_t creator_id;
    uint32_t creator_revision;
};

// RSDP (Root System Description Pointer) 1.0
struct __attribute__((packed)) RSDPDescriptor {
    char     signature[8]; // "RSD PTR "
    uint8_t  checksum;
    char     oem_id[6];
    uint8_t  revision;
    uint32_t rsdt_address;
};

// RSDP 2.0+ Extension
struct __attribute__((packed)) RSDPDescriptor20 {
    RSDPDescriptor first_part;
    uint32_t length;
    uint64_t xsdt_address;
    uint8_t  extended_checksum;
    uint8_t  reserved[3];
};

// FADT (Fixed ACPI Description Table)
struct __attribute__((packed)) FADTTable {
    ACPITableHeader header;
    uint32_t firmware_ctrl;
    uint32_t dsdt;
    uint8_t  reserved1;
    uint8_t  preferred_pm_profile;
    uint16_t sci_int;
    uint32_t smi_cmd;
    uint8_t  acpi_enable;
    uint8_t  acpi_disable;
    uint8_t  s4bios_req;
    uint8_t  pstate_cnt;
    uint32_t pm1a_evt_blk;
    uint32_t pm1b_evt_blk;
    uint32_t pm1a_cnt_blk;
    uint32_t pm1b_cnt_blk;
    uint32_t pm2_cnt_blk;
    uint32_t pm_tmr_blk;
    uint32_t gpe0_blk;
    uint32_t gpe1_blk;
    uint8_t  pm1_evt_len;
    uint8_t  pm1_cnt_len;
    uint8_t  pm2_cnt_len;
    uint8_t  pm_tmr_len;
    uint8_t  gpe0_len;
    uint8_t  gpe1_len;
    uint8_t  gpe1_base;
    uint8_t  cst_cnt;
    uint16_t p_lvl2_lat;
    uint16_t p_lvl3_lat;
    uint16_t flush_size;
    uint16_t flush_stride;
    uint8_t  duty_offset;
    uint8_t  duty_width;
    uint8_t  day_alrm;
    uint8_t  mon_alrm;
    uint8_t  century;
    uint16_t iapc_boot_arch;
    uint8_t  reserved2;
    uint32_t flags;
    ACPI_GAS reset_reg;
    uint8_t  reset_value;
    uint8_t  reserved3[3];
    uint64_t x_firmware_ctrl;
    uint64_t x_dsdt;
    ACPI_GAS x_pm1a_evt_blk;
    ACPI_GAS x_pm1b_evt_blk;
    ACPI_GAS x_pm1a_cnt_blk;
    ACPI_GAS x_pm1b_cnt_blk;
    ACPI_GAS x_pm2_cnt_blk;
    ACPI_GAS x_pm_tmr_blk;
    ACPI_GAS x_gpe0_blk;
    ACPI_GAS x_gpe1_blk;
};

#ifdef __cplusplus
extern "C" {
#endif

bool acpi_init(void);
bool acpi_is_available(void);
ACPITableHeader* acpi_find_table(const char* signature);

// VirtualBox / Hardware Power Control (V04)
void acpi_poweroff(void) __attribute__((noreturn));
void acpi_reboot(void) __attribute__((noreturn));

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_ARCH_ACPI_H
