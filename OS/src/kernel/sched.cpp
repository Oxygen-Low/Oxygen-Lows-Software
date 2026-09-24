#include "kernel/sched.h"
#include "mm/heap.h"
#include "arch/x86_64/pit.h"
#include "arch/x86_64/io.h"
#include "drivers/serial.h"

namespace {

static Task g_tasks[SCHED_MAX_TASKS];
static Task* g_current_task = nullptr;
static uint32_t g_next_pid = 1;
static bool g_scheduler_enabled = false;
static uint64_t g_last_cpu_calc_tick = 0;
static uint32_t g_total_recent_ticks = 0;

void str_copy_n(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (src[i] && i < max_len - 1) {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

// Background idle / system monitor worker task
void sys_monitor_worker(void* arg) {
    UNUSED(arg);
    while (true) {
        // Periodic background telemetry
        pit_sleep_ms(2000);
        // serial_printf("[SYSMON] Heartbeat tick\n");
    }
}

} // anonymous namespace

extern "C" void task_trampoline(void (*entry)(void*), void* arg) {
    // Re-enable interrupts explicitly for new thread
    sti();
    if (entry) {
        entry(arg);
    }
    sched_exit();
}

extern "C" {

void sched_init(void) {
    for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
        g_tasks[i].id = 0;
        g_tasks[i].state = TASK_UNUSED;
        g_tasks[i].stack_base = 0;
        g_tasks[i].total_ticks = 0;
        g_tasks[i].recent_ticks = 0;
        g_tasks[i].cpu_usage_pct = 0;
    }

    // Task 0 is the Kernel Desktop main loop thread
    Task* main_task = &g_tasks[0];
    main_task->id = g_next_pid++;
    str_copy_n(main_task->name, "Kernel Shell", SCHED_NAME_MAX);
    main_task->state = TASK_RUNNING;
    main_task->priority = 10;
    main_task->stack_base = 0; // Uses bootstrap stack
    main_task->stack_size = 65536;
    main_task->sleep_until_ms = 0;
    main_task->total_ticks = 0;
    main_task->recent_ticks = 0;
    main_task->cpu_usage_pct = 85;

    g_current_task = main_task;
    g_last_cpu_calc_tick = pit_get_ticks();
    g_total_recent_ticks = 0;

    // Create system background worker task
    sched_create_task("System Monitor", sys_monitor_worker, nullptr, 3);

    g_scheduler_enabled = true;
    serial_printf("[SCHED] Preemptive round-robin scheduler initialized\n");
}

Task* sched_create_task(const char* name, void (*entry)(void*), void* arg, uint8_t priority) {
    if (!entry) return nullptr;

    Task* slot = nullptr;
    for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
        if (g_tasks[i].state == TASK_UNUSED || g_tasks[i].state == TASK_TERMINATED) {
            slot = &g_tasks[i];
            break;
        }
    }

    if (!slot) {
        serial_printf("[SCHED] Error: Maximum task limit reached\n");
        return nullptr;
    }

    // Free previous stack if reusing slot
    if (slot->stack_base != 0) {
        kfree(reinterpret_cast<void*>(slot->stack_base));
        slot->stack_base = 0;
    }

    void* stack = kmalloc(SCHED_STACK_SIZE);
    if (!stack) {
        serial_printf("[SCHED] Error: Failed to allocate task stack\n");
        return nullptr;
    }

    slot->id = g_next_pid++;
    str_copy_n(slot->name, name ? name : "Task", SCHED_NAME_MAX);
    slot->state = TASK_READY;
    slot->priority = priority;
    slot->stack_base = reinterpret_cast<uint64_t>(stack);
    slot->stack_size = SCHED_STACK_SIZE;
    slot->sleep_until_ms = 0;
    slot->total_ticks = 0;
    slot->recent_ticks = 0;
    slot->cpu_usage_pct = 1;

    // Align stack top to 16 bytes
    uint64_t stack_top = (slot->stack_base + SCHED_STACK_SIZE - 128) & ~15ULL;

    // Initialize saved InterruptFrame
    for (size_t j = 0; j < sizeof(InterruptFrame); ++j) {
        reinterpret_cast<uint8_t*>(&slot->context)[j] = 0;
    }

    slot->context.rip = reinterpret_cast<uint64_t>(task_trampoline);
    slot->context.cs  = 0x08;
    slot->context.rflags = 0x202; // IF enabled
    slot->context.rsp = stack_top;
    slot->context.ss  = 0x10;
    slot->context.rdi = reinterpret_cast<uint64_t>(entry);
    slot->context.rsi = reinterpret_cast<uint64_t>(arg);
    slot->context.rbp = stack_top;

    serial_printf("[SCHED] Created task '%s' (PID %u, Priority %u)\n", slot->name, slot->id, slot->priority);
    return slot;
}

void sched_schedule(InterruptFrame* frame) {
    if (!g_scheduler_enabled || !g_current_task || !frame) return;

    g_current_task->total_ticks++;
    g_current_task->recent_ticks++;
    g_total_recent_ticks++;

    uint64_t now_ms = pit_get_uptime_ms();

    // Check waking sleeping tasks
    for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
        if (g_tasks[i].state == TASK_SLEEPING && now_ms >= g_tasks[i].sleep_until_ms) {
            g_tasks[i].state = TASK_READY;
        }
    }

    // Recalculate CPU usage every 1000 ticks (~1 second)
    uint64_t cur_ticks = pit_get_ticks();
    if (cur_ticks - g_last_cpu_calc_tick >= 1000) {
        g_last_cpu_calc_tick = cur_ticks;
        if (g_total_recent_ticks > 0) {
            for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
                if (g_tasks[i].state != TASK_UNUSED) {
                    g_tasks[i].cpu_usage_pct = (g_tasks[i].recent_ticks * 100) / g_total_recent_ticks;
                    g_tasks[i].recent_ticks = 0;
                }
            }
        }
        g_total_recent_ticks = 0;
    }

    // Find next ready task using round-robin starting after current
    size_t curr_idx = 0;
    for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
        if (&g_tasks[i] == g_current_task) {
            curr_idx = i;
            break;
        }
    }

    Task* next_task = nullptr;
    for (size_t step = 1; step <= SCHED_MAX_TASKS; ++step) {
        size_t idx = (curr_idx + step) % SCHED_MAX_TASKS;
        if (g_tasks[idx].state == TASK_READY || (g_tasks[idx].state == TASK_RUNNING && &g_tasks[idx] != g_current_task)) {
            next_task = &g_tasks[idx];
            break;
        }
    }

    if (!next_task || next_task == g_current_task) {
        return; // Continue running current task
    }

    // Save context of current task
    g_current_task->context = *frame;
    if (g_current_task->state == TASK_RUNNING) {
        g_current_task->state = TASK_READY;
    }

    // Switch to next task
    next_task->state = TASK_RUNNING;
    g_current_task = next_task;
    *frame = next_task->context;
}

void sched_yield(void) {
    // Trigger timer interrupt or pause
    __asm__ volatile ("int $32");
}

void sched_sleep(uint64_t ms) {
    if (!g_current_task) return;
    g_current_task->sleep_until_ms = pit_get_uptime_ms() + ms;
    g_current_task->state = TASK_SLEEPING;
    sched_yield();
}

void sched_exit(void) {
    if (!g_current_task) return;
    g_current_task->state = TASK_TERMINATED;
    serial_printf("[SCHED] Task '%s' (PID %u) exited\n", g_current_task->name, g_current_task->id);
    sched_yield();
    while (true) {
        hlt();
    }
}

bool sched_kill_task(uint32_t pid) {
    if (pid <= 1) return false; // Prevent killing kernel main shell
    for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
        if (g_tasks[i].id == pid && g_tasks[i].state != TASK_UNUSED && g_tasks[i].state != TASK_TERMINATED) {
            g_tasks[i].state = TASK_TERMINATED;
            serial_printf("[SCHED] Terminated task '%s' (PID %u)\n", g_tasks[i].name, pid);
            return true;
        }
    }
    return false;
}

Task* sched_get_current_task(void) {
    return g_current_task;
}

size_t sched_get_task_count(void) {
    size_t count = 0;
    for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
        if (g_tasks[i].state != TASK_UNUSED) count++;
    }
    return count;
}

bool sched_get_task_info(size_t index, TaskInfo* out_info) {
    if (!out_info) return false;
    size_t found = 0;
    for (size_t i = 0; i < SCHED_MAX_TASKS; ++i) {
        if (g_tasks[i].state != TASK_UNUSED) {
            if (found == index) {
                out_info->id = g_tasks[i].id;
                str_copy_n(out_info->name, g_tasks[i].name, SCHED_NAME_MAX);
                out_info->state = g_tasks[i].state;
                out_info->priority = g_tasks[i].priority;
                out_info->cpu_usage_pct = g_tasks[i].cpu_usage_pct;
                out_info->total_ticks = g_tasks[i].total_ticks;
                out_info->stack_size = g_tasks[i].stack_size;
                return true;
            }
            found++;
        }
    }
    return false;
}

} // extern "C"
