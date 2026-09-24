#ifndef OXYGEN_KERNEL_SERVICE_H
#define OXYGEN_KERNEL_SERVICE_H

#include "types.h"

#define SERVICE_MAX_SERVICES    16
#define SERVICE_NAME_MAX        32
#define SERVICE_DISPLAY_NAME_MAX 48
#define SERVICE_DESC_MAX        96
#define SERVICE_ERR_MAX         80

enum ServiceStatus : uint8_t {
    SERVICE_STOPPED = 0,
    SERVICE_STARTING,
    SERVICE_RUNNING,
    SERVICE_STOPPING
};

enum ServiceStartupType : uint8_t {
    SERVICE_STARTUP_DISABLED = 0,
    SERVICE_STARTUP_MANUAL = 1,
    SERVICE_STARTUP_AUTOMATIC = 2
};

typedef bool (*ServiceStartFn)(void);
typedef bool (*ServiceStopFn)(void);

struct ServiceInfo {
    uint32_t           id;
    char               name[SERVICE_NAME_MAX];
    char               display_name[SERVICE_DISPLAY_NAME_MAX];
    char               description[SERVICE_DESC_MAX];
    ServiceStatus      status;
    ServiceStartupType startup_type;
    bool               is_critical;
    uint32_t           task_id;
    uint64_t           start_time_ms;
};

#ifdef __cplusplus
extern "C" {
#endif

// Initialize the kernel service subsystem and register default services
void   service_mgr_init(void);

// Register a new service
bool   service_register(const char* name,
                        const char* display_name,
                        const char* description,
                        ServiceStartupType startup_type,
                        bool is_critical,
                        ServiceStartFn start_fn,
                        ServiceStopFn stop_fn);

// Control services
bool   service_start(const char* name, char* err_out = nullptr, size_t err_len = 0);
bool   service_stop(const char* name, char* err_out = nullptr, size_t err_len = 0);
bool   service_set_startup(const char* name, ServiceStartupType type, char* err_out = nullptr, size_t err_len = 0);

// Query services
size_t service_get_count(void);
bool   service_get_info(size_t index, ServiceInfo* out_info);
bool   service_get_by_name(const char* name, ServiceInfo* out_info);

// Boot sequence: start all services with SERVICE_STARTUP_AUTOMATIC
// Reports each service start via the callback function
typedef void (*ServiceBootReporter)(const char* display_name, bool success);
void   service_boot_start_autostart_services(ServiceBootReporter reporter);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_KERNEL_SERVICE_H
