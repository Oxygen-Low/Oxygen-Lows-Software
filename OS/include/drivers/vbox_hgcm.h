#ifndef OXYGEN_DRIVERS_VBOX_HGCM_H
#define OXYGEN_DRIVERS_VBOX_HGCM_H

#include "types.h"
#include "drivers/vbox_guest.h"

// HGCM Request Types
#define VMMDEVREQ_HGCM_CONNECT    60
#define VMMDEVREQ_HGCM_DISCONNECT 61
#define VMMDEVREQ_HGCM_CALL       62
#define VMMDEVREQ_HGCM_CANCEL     63

// HGCM Service Location Types
#define VBOX_HGCM_SVC_LOCATION_UNDEFINED 0
#define VBOX_HGCM_SVC_LOCATION_LOCALHOST 1

// HGCM Parameter Types
#define HGCM_PARM_TYPE_INVALID   0
#define HGCM_PARM_TYPE_32BIT     1
#define HGCM_PARM_TYPE_64BIT     2
#define HGCM_PARM_TYPE_PAGELIST  3
#define HGCM_PARM_TYPE_EMBEDDED  4
#define HGCM_PARM_TYPE_LINEAR    5

// Shared Folders Service Function Codes
#define SHFL_FN_QUERY_MAPPINGS 1
#define SHFL_FN_QUERY_MAP      2
#define SHFL_FN_ADD_MAPPING    3
#define SHFL_FN_REMOVE_MAPPING 4
#define SHFL_FN_CREATE         5
#define SHFL_FN_CLOSE          6
#define SHFL_FN_READ           7
#define SHFL_FN_WRITE          8

// HGCM Service Location Specifier
struct __attribute__((packed)) HGCMServiceLocation {
    uint32_t type;
    union {
        char name[64];
    } u;
};

// HGCM Connect Request
struct __attribute__((packed)) VMMDevHGCMConnect {
    VMMDevRequestHeader header;
    HGCMServiceLocation loc;
    uint32_t client_id;
};

// HGCM Disconnect Request
struct __attribute__((packed)) VMMDevHGCMDisconnect {
    VMMDevRequestHeader header;
    uint32_t client_id;
};

// HGCM Function Call Parameter
struct __attribute__((packed)) HGCMFunctionParameter {
    uint32_t type;
    union {
        uint32_t u32;
        uint64_t u64;
        struct {
            uint32_t size;
            union {
                void*    linear_addr;
                uint8_t  raw[8];
            } u;
        } pointer;
        struct {
            uint32_t size;
            uint8_t  data[16];
        } embedded;
    } u;
};

// HGCM Function Call Request (up to 4 parameters)
struct __attribute__((packed)) VMMDevHGCMCall {
    VMMDevRequestHeader header;
    uint32_t client_id;
    uint32_t function;
    uint32_t cParms;
    HGCMFunctionParameter aParms[4];
};

#ifdef __cplusplus
extern "C" {
#endif

// HGCM Subsystem Management
bool vbox_hgcm_init(void);
bool vbox_hgcm_is_available(void);

// Connection Management
int32_t vbox_hgcm_connect(const char* service_name, uint32_t* out_client_id);
int32_t vbox_hgcm_disconnect(uint32_t client_id);

// Shared Folders Host Communication (V05)
bool vbox_shared_folders_init(void);
bool vbox_shared_folders_is_available(void);
int32_t vbox_shared_folders_query_mappings(uint32_t* out_mapping_count);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_VBOX_HGCM_H
