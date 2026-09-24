#include "kernel/service.h"
#include "kernel/sched.h"
#include "mm/heap.h"
#include "mm/pmm.h"
#include "fs/fat32.h"
#include "arch/x86_64/pit.h"
#include "drivers/serial.h"

namespace {

struct ServiceEntry {
    uint32_t           id;
    char               name[SERVICE_NAME_MAX];
    char               display_name[SERVICE_DISPLAY_NAME_MAX];
    char               description[SERVICE_DESC_MAX];
    ServiceStatus      status;
    ServiceStartupType startup_type;
    bool               is_critical;
    uint32_t           task_id;
    ServiceStartFn     start_fn;
    ServiceStopFn      stop_fn;
    uint64_t           start_time_ms;
};

static ServiceEntry g_services[SERVICE_MAX_SERVICES];
static size_t       g_service_count = 0;
static uint32_t     g_next_service_id = 1;
static bool         g_service_mgr_initialized = false;

void str_copy_n(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (src[i] && i < max_len - 1) {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

bool str_equal(const char* s1, const char* s2) {
    if (!s1 || !s2) return false;
    while (*s1 && *s2) {
        if (*s1 != *s2) return false;
        s1++;
        s2++;
    }
    return *s1 == *s2;
}

void set_error(char* err_out, size_t err_len, const char* msg) {
    if (err_out && err_len > 0) {
        str_copy_n(err_out, msg, err_len);
    }
}

// ==============================================================================
// Default System Core Service Worker & Lifecycle
// ==============================================================================

static volatile bool g_system_core_running = false;

// Background worker thread for the System Core Service
// Supervises system health, memory margins, storage subsystem, and service manager
void system_core_worker(void* arg) {
    UNUSED(arg);
    serial_printf("[SYSCORE] Oxygen Low's System Service worker active\n");

    while (g_system_core_running) {
        // Heartbeat & health check every 2 seconds
        pit_sleep_ms(2000);

        // Verify physical frame allocator and heap sanity
        size_t free_frames = pmm_get_free_frames();
        if (free_frames == 0) {
            serial_printf("[SYSCORE] WARNING: Critical physical memory exhaustion!\n");
        }

        // Periodic maintenance check
        // serial_printf("[SYSCORE] System health OK, Free Frames: %u\n", (uint32_t)free_frames);
    }

    serial_printf("[SYSCORE] Oxygen Low's System Service worker stopped\n");
}

bool system_core_start(void) {
    g_system_core_running = true;
    Task* task = sched_create_task("System Core Daemon", system_core_worker, nullptr, 4);
    if (!task) {
        serial_printf("[SYSCORE] Failed to spawn System Core Daemon task\n");
        return false;
    }

    // Link task ID to the service entry
    for (size_t i = 0; i < g_service_count; ++i) {
        if (str_equal(g_services[i].name, "system-core")) {
            g_services[i].task_id = task->id;
            break;
        }
    }

    serial_printf("[SYSCORE] Oxygen Low's System Service started successfully (PID %u)\n", task->id);
    return true;
}

bool system_core_stop(void) {
    // This function should never be reached since is_critical protects it,
    // but implement graceful refusal just in case.
    return false;
}

} // anonymous namespace

// ==============================================================================
// Kernel Service Subsystem Public API
// ==============================================================================

extern "C" {

void service_mgr_init(void) {
    if (g_service_mgr_initialized) return;

    for (size_t i = 0; i < SERVICE_MAX_SERVICES; ++i) {
        g_services[i].id = 0;
        g_services[i].name[0] = '\0';
        g_services[i].display_name[0] = '\0';
        g_services[i].description[0] = '\0';
        g_services[i].status = SERVICE_STOPPED;
        g_services[i].startup_type = SERVICE_STARTUP_DISABLED;
        g_services[i].is_critical = false;
        g_services[i].task_id = 0;
        g_services[i].start_fn = nullptr;
        g_services[i].stop_fn = nullptr;
        g_services[i].start_time_ms = 0;
    }
    g_service_count = 0;

    // Register Default Non-Cancellable System Service:
    // "Oxygen Low's System Service" (system-core)
    // Runs in the background and is the entire system core runtime.
    service_register("system-core",
                     "Oxygen Low's System Service",
                     "Supervises GUI, memory, storage, service manager, and core OS runtime.",
                     SERVICE_STARTUP_AUTOMATIC,
                     true, // is_critical = true (cannot be cancelled/disabled)
                     system_core_start,
                     system_core_stop);

    g_service_mgr_initialized = true;
    serial_printf("[SERVICE] Kernel Service Manager initialized (%u service registered)\n",
                  static_cast<uint32_t>(g_service_count));
}

bool service_register(const char* name,
                      const char* display_name,
                      const char* description,
                      ServiceStartupType startup_type,
                      bool is_critical,
                      ServiceStartFn start_fn,
                      ServiceStopFn stop_fn) {
    if (!name || g_service_count >= SERVICE_MAX_SERVICES) {
        return false;
    }

    // Check for duplicate name
    for (size_t i = 0; i < g_service_count; ++i) {
        if (str_equal(g_services[i].name, name)) {
            return false;
        }
    }

    ServiceEntry* entry = &g_services[g_service_count++];
    entry->id = g_next_service_id++;
    str_copy_n(entry->name, name, SERVICE_NAME_MAX);
    str_copy_n(entry->display_name, display_name ? display_name : name, SERVICE_DISPLAY_NAME_MAX);
    str_copy_n(entry->description, description ? description : "", SERVICE_DESC_MAX);
    entry->status = SERVICE_STOPPED;
    entry->startup_type = startup_type;
    entry->is_critical = is_critical;
    entry->task_id = 0;
    entry->start_fn = start_fn;
    entry->stop_fn = stop_fn;
    entry->start_time_ms = 0;

    serial_printf("[SERVICE] Registered service '%s' ('%s', %s, Critical=%s)\n",
                  entry->name, entry->display_name,
                  (entry->startup_type == SERVICE_STARTUP_AUTOMATIC) ? "Auto" : "Manual/Disabled",
                  entry->is_critical ? "YES" : "NO");
    return true;
}

bool service_start(const char* name, char* err_out, size_t err_len) {
    if (!name) {
        set_error(err_out, err_len, "Invalid service name");
        return false;
    }

    ServiceEntry* target = nullptr;
    for (size_t i = 0; i < g_service_count; ++i) {
        if (str_equal(g_services[i].name, name)) {
            target = &g_services[i];
            break;
        }
    }

    if (!target) {
        set_error(err_out, err_len, "Service not found");
        return false;
    }

    if (target->status == SERVICE_RUNNING) {
        set_error(err_out, err_len, "Service is already running");
        return true;
    }

    target->status = SERVICE_STARTING;
    if (target->start_fn) {
        bool ok = target->start_fn();
        if (!ok) {
            target->status = SERVICE_STOPPED;
            set_error(err_out, err_len, "Service start function returned failure");
            return false;
        }
    }

    target->status = SERVICE_RUNNING;
    target->start_time_ms = pit_get_uptime_ms();
    serial_printf("[SERVICE] Started service '%s'\n", target->name);
    return true;
}

bool service_stop(const char* name, char* err_out, size_t err_len) {
    if (!name) {
        set_error(err_out, err_len, "Invalid service name");
        return false;
    }

    ServiceEntry* target = nullptr;
    for (size_t i = 0; i < g_service_count; ++i) {
        if (str_equal(g_services[i].name, name)) {
            target = &g_services[i];
            break;
        }
    }

    if (!target) {
        set_error(err_out, err_len, "Service not found");
        return false;
    }

    // Critical non-cancellable service check!
    if (target->is_critical) {
        set_error(err_out, err_len, "Cannot cancel service: The process is the entire system.");
        serial_printf("[SERVICE] Denied attempt to stop critical system service '%s'\n", target->name);
        return false;
    }

    if (target->status == SERVICE_STOPPED) {
        set_error(err_out, err_len, "Service is already stopped");
        return true;
    }

    target->status = SERVICE_STOPPING;
    if (target->stop_fn) {
        target->stop_fn();
    }

    if (target->task_id != 0) {
        sched_kill_task(target->task_id);
        target->task_id = 0;
    }

    target->status = SERVICE_STOPPED;
    serial_printf("[SERVICE] Stopped service '%s'\n", target->name);
    return true;
}

bool service_set_startup(const char* name, ServiceStartupType type, char* err_out, size_t err_len) {
    if (!name) {
        set_error(err_out, err_len, "Invalid service name");
        return false;
    }

    ServiceEntry* target = nullptr;
    for (size_t i = 0; i < g_service_count; ++i) {
        if (str_equal(g_services[i].name, name)) {
            target = &g_services[i];
            break;
        }
    }

    if (!target) {
        set_error(err_out, err_len, "Service not found");
        return false;
    }

    // Critical service check - autostart cannot be disabled!
    if (target->is_critical && type == SERVICE_STARTUP_DISABLED) {
        set_error(err_out, err_len, "Cannot disable startup: The process is the entire system.");
        serial_printf("[SERVICE] Denied attempt to disable autostart for critical service '%s'\n", target->name);
        return false;
    }

    target->startup_type = type;
    serial_printf("[SERVICE] Set startup for '%s' to %s\n", target->name,
                  (type == SERVICE_STARTUP_AUTOMATIC) ? "Automatic" :
                  (type == SERVICE_STARTUP_MANUAL) ? "Manual" : "Disabled");
    return true;
}

size_t service_get_count(void) {
    return g_service_count;
}

bool service_get_info(size_t index, ServiceInfo* out_info) {
    if (index >= g_service_count || !out_info) {
        return false;
    }

    const ServiceEntry* src = &g_services[index];
    out_info->id = src->id;
    str_copy_n(out_info->name, src->name, SERVICE_NAME_MAX);
    str_copy_n(out_info->display_name, src->display_name, SERVICE_DISPLAY_NAME_MAX);
    str_copy_n(out_info->description, src->description, SERVICE_DESC_MAX);
    out_info->status = src->status;
    out_info->startup_type = src->startup_type;
    out_info->is_critical = src->is_critical;
    out_info->task_id = src->task_id;
    out_info->start_time_ms = src->start_time_ms;
    return true;
}

bool service_get_by_name(const char* name, ServiceInfo* out_info) {
    if (!name || !out_info) return false;
    for (size_t i = 0; i < g_service_count; ++i) {
        if (str_equal(g_services[i].name, name)) {
            return service_get_info(i, out_info);
        }
    }
    return false;
}

void service_boot_start_autostart_services(ServiceBootReporter reporter) {
    serial_printf("[SERVICE] Starting autostart services at boot...\n");

    for (size_t i = 0; i < g_service_count; ++i) {
        ServiceEntry* svc = &g_services[i];
        if (svc->startup_type == SERVICE_STARTUP_AUTOMATIC) {
            char err[SERVICE_ERR_MAX];
            bool ok = service_start(svc->name, err, sizeof(err));
            if (reporter) {
                reporter(svc->display_name, ok);
            }
        }
    }

    serial_printf("[SERVICE] All autostart services initialized\n");
}

} // extern "C"
