#ifndef OXYGEN_APPS_TERMINAL_APP_H
#define OXYGEN_APPS_TERMINAL_APP_H

#include "apps/app.h"

#define TERMINAL_MAX_ROWS    32
#define TERMINAL_MAX_COLS    80
#define TERMINAL_BUFFER_ROWS 128
#define TERMINAL_INPUT_LEN   128
#define TERMINAL_HISTORY_LEN 16

class TerminalApp : public Application {
public:
    TerminalApp();
    virtual ~TerminalApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_key_down(uint8_t scancode, char ascii) override;
    virtual void on_update() override;

    void print_char(char c);
    void print_string(const char* str);
    void print_line(const char* str);
    void clear_screen(void);
    void execute_command(const char* cmd);

private:
    Window* m_window;
    char    m_buffer[TERMINAL_BUFFER_ROWS][TERMINAL_MAX_COLS + 1];
    Color   m_fg_color[TERMINAL_BUFFER_ROWS][TERMINAL_MAX_COLS + 1];
    int32_t m_cursor_row;
    int32_t m_cursor_col;
    int32_t m_view_offset_row;
    
    char    m_input_buffer[TERMINAL_INPUT_LEN];
    int32_t m_input_len;
    int32_t m_input_pos;

    char    m_history[TERMINAL_HISTORY_LEN][TERMINAL_INPUT_LEN];
    int32_t m_history_count;
    int32_t m_history_index;

    bool    m_cursor_visible;
    uint64_t m_last_blink_tick;

    void scroll_up(void);
    void new_line(void);
    void print_prompt(void);
};

#endif // OXYGEN_APPS_TERMINAL_APP_H
