#ifndef OXYGEN_APPS_SYSINFO_APP_H
#define OXYGEN_APPS_SYSINFO_APP_H

#include "apps/app.h"

class SysInfoApp : public Application {
public:
    SysInfoApp();
    virtual ~SysInfoApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_update() override;

private:
    Window*  m_window;
    uint64_t m_last_refresh_ms;
};

#endif // OXYGEN_APPS_SYSINFO_APP_H
