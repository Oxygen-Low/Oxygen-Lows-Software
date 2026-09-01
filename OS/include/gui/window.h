#ifndef OXYGEN_GUI_WINDOW_H
#define OXYGEN_GUI_WINDOW_H

#include "types.h"
#include "gui/graphics.h"

enum WindowFlags : uint32_t {
    WF_NONE        = 0x00,
    WF_TITLEBAR    = 0x01,
    WF_CLOSABLE    = 0x02,
    WF_MINIMIZABLE = 0x04,
    WF_RESIZABLE   = 0x08,
    WF_MODAL       = 0x10,
    WF_BORDERLESS  = 0x20
};

enum WindowState : uint8_t {
    WS_NORMAL,
    WS_MINIMIZED,
    WS_MAXIMIZED,
    WS_CLOSED
};

#define WINDOW_TITLEBAR_HEIGHT 24
#define WINDOW_BORDER_WIDTH     2
#define WINDOW_CLOSE_BTN_SIZE  16
#define WINDOW_MAX_TITLE_LEN   64

class Application;

struct Window {
    uint32_t     id;
    char         title[WINDOW_MAX_TITLE_LEN];
    Rect         bounds;          // Outer frame (including borders & titlebar)
    Rect         client_bounds;   // Inner client drawable area
    uint32_t     flags;
    WindowState  state;
    bool         is_focused;
    bool         is_dirty;
    Application* app;
    
    // Z-Order Doubly Linked List
    Window*      prev;
    Window*      next;
};

#ifdef __cplusplus
extern "C" {
#endif

void    wm_init(void);
Window* wm_create_window(const char* title, int32_t x, int32_t y, int32_t w, int32_t h, uint32_t flags, Application* app);
void    wm_destroy_window(Window* win);
void    wm_focus_window(Window* win);
void    wm_minimize_window(Window* win);
void    wm_restore_window(Window* win);
void    wm_close_window(Window* win);

// Event Dispatchers
bool    wm_handle_mouse_down(int32_t x, int32_t y, uint8_t buttons);
bool    wm_handle_mouse_up(int32_t x, int32_t y, uint8_t buttons);
bool    wm_handle_mouse_move(int32_t x, int32_t y);
bool    wm_handle_key_down(uint8_t scancode, char ascii);

// Rendering & Queries
void    wm_render(void);
Window* wm_get_top_window(void);
Window* wm_get_bottom_window(void);
Window* wm_get_window_at(int32_t x, int32_t y);
size_t  wm_get_window_count(void);
Window* wm_get_window_by_index(size_t index);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_WINDOW_H
