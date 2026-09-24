#ifndef OXYGEN_APPS_NOTEPAD_APP_H
#define OXYGEN_APPS_NOTEPAD_APP_H

#include "apps/app.h"
#include "gui/file_dialog.h"

#define NOTEPAD_MAX_BUFFER_SIZE 65536
#define NOTEPAD_MAX_LINES       2048
#define NOTEPAD_LINE_MAX_LEN    256

class NotepadApp : public Application {
public:
    NotepadApp();
    virtual ~NotepadApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_key_down(uint8_t scancode, char ascii) override;
    virtual void on_update() override;
    virtual void on_resize(int32_t width, int32_t height) override;

    void clear_document(void);
    void insert_char(char c);
    void delete_backspace(void);
    void delete_forward(void);
    void new_line(void);
    bool open_file(const char* path);
    bool save_file(const char* path);

private:
    Window*    m_window;
    char       m_buffer[NOTEPAD_MAX_BUFFER_SIZE];
    size_t     m_buffer_len;
    char       m_current_filepath[FILE_DIALOG_PATH_MAX];
    
    int32_t    m_cursor_pos;
    int32_t    m_cursor_line;
    int32_t    m_cursor_col;
    
    int32_t    m_scroll_line;
    bool       m_cursor_blink;
    uint64_t   m_last_blink_tick;

    FileDialog m_file_dialog;

    void update_line_col(void);
    void recompute_lines(void);
};

#endif // OXYGEN_APPS_NOTEPAD_APP_H
