#ifndef OXYGEN_APPS_TASKMGR_APP_H
#define OXYGEN_APPS_TASKMGR_APP_H

#include "apps/app.h"
#include "kernel/sched.h"

#define TASKMGR_MAX_HISTORY 32

class TaskMgrApp : public Application {
public:
    TaskMgrApp();
    virtual ~TaskMgrApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_key_down(uint8_t scancode, char ascii) override;
    virtual void on_update() override;
    virtual void on_resize(int32_t width, int32_t height) override;

private:
    Window*  m_window;
    uint8_t  m_current_tab; // 0: Processes, 1: Performance
    int32_t  m_selected_index;
    uint64_t m_last_refresh_ms;
    
    // CPU history for performance sparkline graph
    uint8_t  m_cpu_history[TASKMGR_MAX_HISTORY];
    size_t   m_history_idx;

    void draw_processes_view(const Rect& client_area);
    void draw_performance_view(const Rect& client_area);
};

#endif // OXYGEN_APPS_TASKMGR_APP_H
