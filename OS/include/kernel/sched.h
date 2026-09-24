#ifndef OXYGEN_KERNEL_SCHED_H
#define OXYGEN_KERNEL_SCHED_H

#include "types.h"
#include "arch/x86_64/idt.h"

enum TaskState : uint8_t {
    TASK_UNUSED = 0,
    TASK_READY,
    TASK_RUNNING,
    TASK_SLEEPING,
    TASK_BLOCKED,
    TASK_TERMINATED
};

#define SCHED_MAX_TASKS   32
#define SCHED_STACK_SIZE  16384
#define SCHED_NAME_MAX    32

struct Task {
    uint32_t       id;
    char           name[SCHED_NAME_MAX];
    TaskState      state;
    uint8_t        priority;
    uint64_t       rsp;
    uint64_t       stack_base;
    size_t         stack_size;
    uint64_t       sleep_until_ms;
    uint64_t       total_ticks;
    uint32_t       recent_ticks;
    uint32_t       cpu_usage_pct;
    InterruptFrame context;
};

struct TaskInfo {
    uint32_t  id;
    char      name[SCHED_NAME_MAX];
    TaskState state;
    uint8_t   priority;
    uint32_t  cpu_usage_pct;
    uint64_t  total_ticks;
    size_t    stack_size;
};

#ifdef __cplusplus
extern "C" {
#endif

void     sched_init(void);
Task*    sched_create_task(const char* name, void (*entry)(void*), void* arg = nullptr, uint8_t priority = 5);
void     sched_schedule(InterruptFrame* frame);
void     sched_yield(void);
void     sched_sleep(uint64_t ms);
void     sched_exit(void);
bool     sched_kill_task(uint32_t pid);
Task*    sched_get_current_task(void);
size_t   sched_get_task_count(void);
bool     sched_get_task_info(size_t index, TaskInfo* out_info);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_KERNEL_SCHED_H
