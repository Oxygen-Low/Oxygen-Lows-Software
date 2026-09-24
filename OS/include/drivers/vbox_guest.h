#ifndef OXYGEN_DRIVERS_VBOX_GUEST_H
#define OXYGEN_DRIVERS_VBOX_GUEST_H

#include "types.h"

// VMMDev Request Header Constants
#define VMMDEV_REQUEST_HEADER_VERSION 0x10001

#define VMMDEVREQ_GET_MOUSE_STATUS    1
#define VMMDEVREQ_SET_MOUSE_STATUS    2
#define VMMDEVREQ_SET_POINTER_SHAPE   3
#define VMMDEVREQ_GET_HOST_TIME       10
#define VMMDEVREQ_ACK_EVENTS          41
#define VMMDEVREQ_CTL_GUEST_FILTER    42
#define VMMDEVREQ_REPORT_GUEST_INFO   50
#define VMMDEVREQ_REPORT_GUEST_STATUS 51

#define VMMDEV_MOUSE_GUEST_CAN_ABSOLUTE      0x0001
#define VMMDEV_MOUSE_HOST_WANTS_ABSOLUTE     0x0002
#define VMMDEV_MOUSE_GUEST_NEEDS_HOST_CURSOR 0x0004

// Header prepended to all VMMDev hypercall requests
struct __attribute__((packed)) VMMDevRequestHeader {
    uint32_t size;
    uint32_t version;
    uint32_t requestType;
    int32_t  rc;
    uint32_t reserved1;
    uint32_t reserved2;
};

// Mouse status query & configuration request
struct __attribute__((packed)) VMMDevReqMouseStatus {
    VMMDevRequestHeader header;
    uint32_t mouseFeatures;
    int32_t  pointerXPos;
    int32_t  pointerYPos;
};

// Host time query request (UTC milliseconds)
struct __attribute__((packed)) VMMDevReqHostTime {
    VMMDevRequestHeader header;
    uint64_t host_time;
};

// Guest information report request
struct __attribute__((packed)) VMMDevReqReportGuestInfo {
    VMMDevRequestHeader header;
    uint32_t interfaceVersion;
    uint32_t osType;
};

// Event acknowledgement request
struct __attribute__((packed)) VMMDevReqAckEvents {
    VMMDevRequestHeader header;
    uint32_t events;
};

#ifdef __cplusplus
extern "C" {
#endif

// Initialization and Status
bool vbox_guest_init(void);
bool vbox_guest_is_available(void);
bool vbox_guest_send_request(void* request_phys);

// Absolute Mouse Integration (V02)
bool vbox_guest_enable_absolute_mouse(void);
bool vbox_guest_disable_absolute_mouse(void);
bool vbox_guest_poll_mouse(int32_t screen_w, int32_t screen_h);
bool vbox_guest_is_absolute_mouse_enabled(void);

// Host Time Synchronization (V09)
bool vbox_guest_get_host_time(uint64_t* out_utc_ms);
uint64_t vbox_guest_get_last_sync_time(void);

// Periodic Heartbeat
void vbox_guest_heartbeat(void);
void vbox_guest_update(int32_t screen_w, int32_t screen_h);

// Internal helper to get VMMDev port/MMIO
uint16_t vbox_guest_get_io_port(void);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_DRIVERS_VBOX_GUEST_H
