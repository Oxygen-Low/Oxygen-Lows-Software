#ifndef OXYGEN_APPS_SERVICES_APP_H
#define OXYGEN_APPS_SERVICES_APP_H

#include "apps/app.h"
#include "kernel/service.h"

class ServicesApp : public Application {
public:
    ServicesApp();
    virtual ~ServicesApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_key_down(uint8_t scancode, char ascii) override;
    virtual void on_update() override;
    virtual void on_resize(int32_t width, int32_t height) override;

private:
    Window* m_window;
    int32_t m_selected_index;
    char    m_status_message[128];
    Color   m_status_color;
    uint64_t m_last_refresh_ms;

    void refresh_list();
    void set_status(const char* msg, Color col);
};

#endif // OXYGEN_APPS_SERVICES_APP_H
