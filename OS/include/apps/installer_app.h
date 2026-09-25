#ifndef OXYGEN_APPS_INSTALLER_APP_H
#define OXYGEN_APPS_INSTALLER_APP_H

#include "apps/app.h"
#include "drivers/ata.h"
#include "fs/fat32.h"

enum InstallerMode {
    INSTALL_MODE_INSTALL = 0,
    INSTALL_MODE_UPDATE  = 1,
    INSTALL_MODE_REPAIR  = 2
};

enum InstallerPage {
    PAGE_WELCOME     = 0,
    PAGE_DISK_SELECT = 1,
    PAGE_CONFIRM     = 2,
    PAGE_PROGRESS    = 3,
    PAGE_FINISH      = 4
};

class InstallerApp : public Application {
public:
    InstallerApp(InstallerMode initial_mode = INSTALL_MODE_INSTALL);
    virtual ~InstallerApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_mouse_up(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_key_down(uint8_t scancode, char ascii) override;
    virtual void on_update(void) override;

    void set_mode(InstallerMode mode);
    void add_log(const char* message);
    void set_progress(const char* step, int pct);

private:
    Window*       m_window;
    InstallerMode m_mode;
    InstallerPage m_page;
    int32_t       m_selected_drive;
    int           m_progress_pct;
    char          m_status_text[128];
    bool          m_operation_running;
    bool          m_operation_finished;
    bool          m_operation_success;
    
    // Auto-reboot countdown
    bool          m_countdown_active;
    int           m_countdown_seconds;
    uint64_t      m_last_countdown_tick;

    // Log messages
    char          m_logs[8][96];
    int           m_log_count;

    void run_operation(void);
    void cancel_countdown(void);
    void reboot_system(void);
};

#endif // OXYGEN_APPS_INSTALLER_APP_H
