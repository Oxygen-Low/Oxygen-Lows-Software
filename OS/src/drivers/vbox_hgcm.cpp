#include "drivers/vbox_hgcm.h"
#include "drivers/vbox_guest.h"
#include "drivers/serial.h"

namespace {

bool g_hgcm_initialized = false;
bool g_shfl_connected = false;
uint32_t g_shfl_client_id = 0;
uint32_t g_shfl_mapping_count = 0;

// Statically allocated request buffers in identity-mapped address space
alignas(16) VMMDevHGCMConnect    g_hgcm_connect_req;
alignas(16) VMMDevHGCMDisconnect g_hgcm_disconnect_req;
alignas(16) VMMDevHGCMCall       g_hgcm_call_req;

void str_copy(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (i < max_len - 1 && src[i] != '\0') {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

} // anonymous namespace

extern "C" {

bool vbox_hgcm_init(void) {
    if (!vbox_guest_is_available()) {
        g_hgcm_initialized = false;
        return false;
    }

    g_hgcm_initialized = true;
    serial_printf("[HGCM] VirtualBox Host-Guest Communication Manager ready\n");
    return true;
}

bool vbox_hgcm_is_available(void) {
    return g_hgcm_initialized && vbox_guest_is_available();
}

int32_t vbox_hgcm_connect(const char* service_name, uint32_t* out_client_id) {
    if (!vbox_hgcm_is_available() || !service_name || !out_client_id) {
        return -1;
    }

    g_hgcm_connect_req.header.size = sizeof(VMMDevHGCMConnect);
    g_hgcm_connect_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_hgcm_connect_req.header.requestType = VMMDEVREQ_HGCM_CONNECT;
    g_hgcm_connect_req.header.rc = -1;
    g_hgcm_connect_req.header.reserved1 = 0;
    g_hgcm_connect_req.header.reserved2 = 0;

    g_hgcm_connect_req.loc.type = VBOX_HGCM_SVC_LOCATION_LOCALHOST;
    str_copy(g_hgcm_connect_req.loc.u.name, service_name, sizeof(g_hgcm_connect_req.loc.u.name));
    g_hgcm_connect_req.client_id = 0;

    if (!vbox_guest_send_request(&g_hgcm_connect_req)) {
        return g_hgcm_connect_req.header.rc;
    }

    *out_client_id = g_hgcm_connect_req.client_id;
    return 0;
}

int32_t vbox_hgcm_disconnect(uint32_t client_id) {
    if (!vbox_hgcm_is_available() || client_id == 0) {
        return -1;
    }

    g_hgcm_disconnect_req.header.size = sizeof(VMMDevHGCMDisconnect);
    g_hgcm_disconnect_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_hgcm_disconnect_req.header.requestType = VMMDEVREQ_HGCM_DISCONNECT;
    g_hgcm_disconnect_req.header.rc = -1;
    g_hgcm_disconnect_req.header.reserved1 = 0;
    g_hgcm_disconnect_req.header.reserved2 = 0;
    g_hgcm_disconnect_req.client_id = client_id;

    if (!vbox_guest_send_request(&g_hgcm_disconnect_req)) {
        return g_hgcm_disconnect_req.header.rc;
    }

    return 0;
}

bool vbox_shared_folders_init(void) {
    if (!vbox_hgcm_is_available()) {
        return false;
    }

    serial_printf("[SHFL] Connecting to host service 'VBoxSharedFolders'...\n");
    uint32_t client_id = 0;
    int32_t rc = vbox_hgcm_connect("VBoxSharedFolders", &client_id);
    if (rc != 0 || client_id == 0) {
        serial_printf("[SHFL] 'VBoxSharedFolders' service not available on host (rc=%d)\n", rc);
        g_shfl_connected = false;
        return false;
    }

    g_shfl_client_id = client_id;
    g_shfl_connected = true;
    serial_printf("[SHFL] Connected to 'VBoxSharedFolders' (ClientID=0x%08x)\n", client_id);

    // Query available mappings count
    uint32_t count = 0;
    vbox_shared_folders_query_mappings(&count);
    return true;
}

bool vbox_shared_folders_is_available(void) {
    return g_shfl_connected;
}

int32_t vbox_shared_folders_query_mappings(uint32_t* out_mapping_count) {
    if (!g_shfl_connected || !out_mapping_count) {
        if (out_mapping_count) *out_mapping_count = 0;
        return -1;
    }

    g_hgcm_call_req.header.size = sizeof(VMMDevHGCMCall);
    g_hgcm_call_req.header.version = VMMDEV_REQUEST_HEADER_VERSION;
    g_hgcm_call_req.header.requestType = VMMDEVREQ_HGCM_CALL;
    g_hgcm_call_req.header.rc = -1;
    g_hgcm_call_req.header.reserved1 = 0;
    g_hgcm_call_req.header.reserved2 = 0;

    g_hgcm_call_req.client_id = g_shfl_client_id;
    g_hgcm_call_req.function = SHFL_FN_QUERY_MAPPINGS;
    g_hgcm_call_req.cParms = 1;

    // Parameter 0: 32-bit output for mapping count
    g_hgcm_call_req.aParms[0].type = HGCM_PARM_TYPE_32BIT;
    g_hgcm_call_req.aParms[0].u.u32 = 0;

    if (!vbox_guest_send_request(&g_hgcm_call_req)) {
        *out_mapping_count = 0;
        return g_hgcm_call_req.header.rc;
    }

    g_shfl_mapping_count = g_hgcm_call_req.aParms[0].u.u32;
    *out_mapping_count = g_shfl_mapping_count;

    serial_printf("[SHFL] Host reported %u shared folder mapping(s)\n", g_shfl_mapping_count);
    return 0;
}

} // extern "C"
