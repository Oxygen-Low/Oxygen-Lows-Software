#ifndef OXYGEN_APPS_EXPLORER_APP_H
#define OXYGEN_APPS_EXPLORER_APP_H

#include "apps/app.h"
#include "fs/vfs.h"

#define EXPLORER_MAX_ITEMS 64
#define EXPLORER_MAX_PATH  128
#define EXPLORER_PREVIEW_BUF 2048

struct ExplorerItem {
    char   name[VFS_MAX_NAME_LEN];
    uint32_t type;  // VFS_TYPE_FILE or VFS_TYPE_DIRECTORY
    size_t size;
};

class ExplorerApp : public Application {
public:
    ExplorerApp();
    virtual ~ExplorerApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_key_down(uint8_t scancode, char ascii) override;

    void navigate_to(const char* path);
    void navigate_up(void);
    void refresh_list(void);
    void select_item(int32_t index);
    void open_selected_item(void);

private:
    Window*      m_window;
    char         m_current_path[EXPLORER_MAX_PATH];
    ExplorerItem m_items[EXPLORER_MAX_ITEMS];
    size_t       m_item_count;
    int32_t      m_selected_index;
    
    char         m_preview_text[EXPLORER_PREVIEW_BUF];
    bool         m_preview_is_valid;
    
    void load_preview(const char* filename);
};

#endif // OXYGEN_APPS_EXPLORER_APP_H
