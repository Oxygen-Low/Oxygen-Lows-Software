#include "gui/window.h"
#include "gui/font.h"
#include "apps/app.h"
#include "mm/heap.h"
#include "drivers/serial.h"

static Window* g_wm_head = nullptr; // Bottom window (rendered first)
static Window* g_wm_tail = nullptr; // Top window (rendered last, active focus)
static uint32_t g_next_window_id = 1;

static bool    g_is_dragging = false;
static Window* g_drag_window = nullptr;
static int32_t g_drag_offset_x = 0;
static int32_t g_drag_offset_y = 0;

static void update_client_bounds(Window* win) {
    if (!win) return;
    if (win->flags & WF_BORDERLESS) {
        win->client_bounds = win->bounds;
        return;
    }

    int32_t top_offset = (win->flags & WF_TITLEBAR) ? WINDOW_TITLEBAR_HEIGHT : WINDOW_BORDER_WIDTH;
    win->client_bounds.x = win->bounds.x + WINDOW_BORDER_WIDTH;
    win->client_bounds.y = win->bounds.y + top_offset;
    win->client_bounds.width = win->bounds.width - 2 * WINDOW_BORDER_WIDTH;
    win->client_bounds.height = win->bounds.height - top_offset - WINDOW_BORDER_WIDTH;

    if (win->client_bounds.width < 0) win->client_bounds.width = 0;
    if (win->client_bounds.height < 0) win->client_bounds.height = 0;
}

static Rect get_close_btn_rect(const Window* win) {
    return Rect(
        win->bounds.x + win->bounds.width - WINDOW_BORDER_WIDTH - WINDOW_CLOSE_BTN_SIZE - 4,
        win->bounds.y + (WINDOW_TITLEBAR_HEIGHT - WINDOW_CLOSE_BTN_SIZE) / 2,
        WINDOW_CLOSE_BTN_SIZE,
        WINDOW_CLOSE_BTN_SIZE
    );
}

static Rect get_min_btn_rect(const Window* win) {
    int32_t close_left = win->bounds.x + win->bounds.width - WINDOW_BORDER_WIDTH - WINDOW_CLOSE_BTN_SIZE - 4;
    return Rect(
        close_left - WINDOW_CLOSE_BTN_SIZE - 4,
        win->bounds.y + (WINDOW_TITLEBAR_HEIGHT - WINDOW_CLOSE_BTN_SIZE) / 2,
        WINDOW_CLOSE_BTN_SIZE,
        WINDOW_CLOSE_BTN_SIZE
    );
}

void wm_init(void) {
    g_wm_head = nullptr;
    g_wm_tail = nullptr;
    g_next_window_id = 1;
    g_is_dragging = false;
    g_drag_window = nullptr;

    serial_printf("[WM] Window manager initialized\n");
}

Window* wm_create_window(const char* title, int32_t x, int32_t y, int32_t w, int32_t h, uint32_t flags, Application* app) {
    auto* win = reinterpret_cast<Window*>(kmalloc(sizeof(Window)));
    if (!win) {
        serial_printf("[WM] Error: Failed to allocate window struct\n");
        return nullptr;
    }

    win->id = g_next_window_id++;
    
    // Copy title
    size_t i = 0;
    if (title) {
        while (title[i] && i < WINDOW_MAX_TITLE_LEN - 1) {
            win->title[i] = title[i];
            i++;
        }
    }
    win->title[i] = '\0';

    win->bounds = Rect(x, y, w, h);
    win->flags = flags;
    win->state = WS_NORMAL;
    win->is_focused = true;
    win->is_dirty = true;
    win->app = app;
    win->prev = nullptr;
    win->next = nullptr;

    update_client_bounds(win);

    // Insert at tail (top of z-order)
    if (!g_wm_head) {
        g_wm_head = win;
        g_wm_tail = win;
    } else {
        win->prev = g_wm_tail;
        g_wm_tail->next = win;
        g_wm_tail = win;
    }

    // Unfocus other windows
    Window* curr = g_wm_head;
    while (curr) {
        if (curr != win) {
            curr->is_focused = false;
        }
        curr = curr->next;
    }

    if (app) {
        app->on_init(win);
    }

    serial_printf("[WM] Created window '%s' (ID %u) at (%d, %d, %d, %d)\n",
                  win->title, win->id, x, y, w, h);

    return win;
}

void wm_destroy_window(Window* win) {
    if (!win) return;

    if (g_drag_window == win) {
        g_is_dragging = false;
        g_drag_window = nullptr;
    }

    // Remove from linked list
    if (win->prev) {
        win->prev->next = win->next;
    } else {
        g_wm_head = win->next;
    }

    if (win->next) {
        win->next->prev = win->prev;
    } else {
        g_wm_tail = win->prev;
    }

    // Refocus top window
    if (g_wm_tail) {
        g_wm_tail->is_focused = true;
    }

    if (win->app) {
        win->app->on_close();
    }

    kfree(win);
}

void wm_focus_window(Window* win) {
    if (!win || win->state == WS_MINIMIZED || win == g_wm_tail) {
        if (win && win == g_wm_tail) {
            win->is_focused = true;
        }
        return;
    }

    // Unfocus all windows
    Window* curr = g_wm_head;
    while (curr) {
        curr->is_focused = false;
        curr = curr->next;
    }

    // Remove win from current position
    if (win->prev) {
        win->prev->next = win->next;
    } else {
        g_wm_head = win->next;
    }

    if (win->next) {
        win->next->prev = win->prev;
    } else {
        g_wm_tail = win->prev;
    }

    // Insert at tail
    win->prev = g_wm_tail;
    win->next = nullptr;
    if (g_wm_tail) {
        g_wm_tail->next = win;
    } else {
        g_wm_head = win;
    }
    g_wm_tail = win;
    win->is_focused = true;
    win->is_dirty = true;
}

void wm_minimize_window(Window* win) {
    if (!win) return;
    win->state = WS_MINIMIZED;
    win->is_focused = false;

    // Transfer focus to new top visible window
    Window* curr = g_wm_tail;
    while (curr) {
        if (curr->state != WS_MINIMIZED) {
            wm_focus_window(curr);
            break;
        }
        curr = curr->prev;
    }
}

void wm_restore_window(Window* win) {
    if (!win) return;
    win->state = WS_NORMAL;
    wm_focus_window(win);
}

void wm_close_window(Window* win) {
    wm_destroy_window(win);
}

Window* wm_get_top_window(void) {
    return g_wm_tail;
}

Window* wm_get_bottom_window(void) {
    return g_wm_head;
}

Window* wm_get_window_at(int32_t x, int32_t y) {
    // Traverse from top (tail) to bottom (head) for hit-testing
    Window* curr = g_wm_tail;
    while (curr) {
        if (curr->state != WS_MINIMIZED && curr->bounds.contains(x, y)) {
            return curr;
        }
        curr = curr->prev;
    }
    return nullptr;
}

size_t wm_get_window_count(void) {
    size_t count = 0;
    Window* curr = g_wm_head;
    while (curr) {
        count++;
        curr = curr->next;
    }
    return count;
}

Window* wm_get_window_by_index(size_t index) {
    size_t i = 0;
    Window* curr = g_wm_head;
    while (curr) {
        if (i == index) return curr;
        i++;
        curr = curr->next;
    }
    return nullptr;
}

bool wm_handle_mouse_down(int32_t x, int32_t y, uint8_t buttons) {
    Window* win = wm_get_window_at(x, y);
    if (!win) return false;

    wm_focus_window(win);

    if (win->flags & WF_TITLEBAR) {
        Rect title_rect(win->bounds.x, win->bounds.y, win->bounds.width, WINDOW_TITLEBAR_HEIGHT);
        
        // Close button check
        if (win->flags & WF_CLOSABLE) {
            Rect close_btn = get_close_btn_rect(win);
            if (close_btn.contains(x, y)) {
                wm_close_window(win);
                return true;
            }
        }

        // Minimize button check
        if (win->flags & WF_MINIMIZABLE) {
            Rect min_btn = get_min_btn_rect(win);
            if (min_btn.contains(x, y)) {
                wm_minimize_window(win);
                return true;
            }
        }

        // Titlebar drag start
        if (title_rect.contains(x, y)) {
            g_is_dragging = true;
            g_drag_window = win;
            g_drag_offset_x = x - win->bounds.x;
            g_drag_offset_y = y - win->bounds.y;
            return true;
        }
    }

    // Client area mouse down
    if (win->client_bounds.contains(x, y) && win->app) {
        int32_t local_x = x - win->client_bounds.x;
        int32_t local_y = y - win->client_bounds.y;
        win->app->on_mouse_down(local_x, local_y, buttons);
        return true;
    }

    return true;
}

bool wm_handle_mouse_up(int32_t x, int32_t y, uint8_t buttons) {
    if (g_is_dragging) {
        g_is_dragging = false;
        g_drag_window = nullptr;
        return true;
    }

    Window* win = wm_get_window_at(x, y);
    if (win && win->client_bounds.contains(x, y) && win->app) {
        int32_t local_x = x - win->client_bounds.x;
        int32_t local_y = y - win->client_bounds.y;
        win->app->on_mouse_up(local_x, local_y, buttons);
        return true;
    }

    return false;
}

bool wm_handle_mouse_move(int32_t x, int32_t y) {
    if (g_is_dragging && g_drag_window) {
        int32_t new_x = x - g_drag_offset_x;
        int32_t new_y = y - g_drag_offset_y;

        // Clamping to keep titlebar reachable
        int32_t screen_w = static_cast<int32_t>(fb_get_width());
        int32_t screen_h = static_cast<int32_t>(fb_get_height());

        if (new_x < -g_drag_window->bounds.width + 50) new_x = -g_drag_window->bounds.width + 50;
        if (new_x > screen_w - 50) new_x = screen_w - 50;
        if (new_y < 0) new_y = 0;
        if (new_y > screen_h - 32 - WINDOW_TITLEBAR_HEIGHT) new_y = screen_h - 32 - WINDOW_TITLEBAR_HEIGHT;

        g_drag_window->bounds.x = new_x;
        g_drag_window->bounds.y = new_y;
        update_client_bounds(g_drag_window);
        g_drag_window->is_dirty = true;
        return true;
    }

    Window* win = wm_get_window_at(x, y);
    if (win && win->client_bounds.contains(x, y) && win->app) {
        int32_t local_x = x - win->client_bounds.x;
        int32_t local_y = y - win->client_bounds.y;
        win->app->on_mouse_move(local_x, local_y);
        return true;
    }

    return false;
}

bool wm_handle_key_down(uint8_t scancode, char ascii) {
    // Deliver key events to top focused window
    if (g_wm_tail && g_wm_tail->state != WS_MINIMIZED && g_wm_tail->app) {
        g_wm_tail->app->on_key_down(scancode, ascii);
        return true;
    }
    return false;
}

void wm_render(void) {
    // Render windows from bottom (head) to top (tail)
    Window* curr = g_wm_head;
    while (curr) {
        if (curr->state == WS_MINIMIZED) {
            curr = curr->next;
            continue;
        }

        const Rect& b = curr->bounds;
        
        if (!(curr->flags & WF_BORDERLESS)) {
            // Outer drop shadow (2px soft edge)
            gfx_fill_rect(b.x + 4, b.y + 4, b.width, b.height, Color(0, 0, 0, 80));

            // Outer 1px frame border
            Color border_outer = curr->is_focused ? Color(8, 131, 149, 255) : Color(30, 41, 59, 255);
            gfx_draw_rect(b.x, b.y, b.width, b.height, border_outer);

            // Titlebar
            if (curr->flags & WF_TITLEBAR) {
                Rect titlebar_rect(b.x + 1, b.y + 1, b.width - 2, WINDOW_TITLEBAR_HEIGHT - 1);
                
                if (curr->is_focused) {
                    // Active Titlebar: Gradient Deep Cyan -> Vibrant Blue
                    gfx_draw_gradient_v(titlebar_rect.x, titlebar_rect.y, titlebar_rect.width, titlebar_rect.height,
                                        Color(10, 77, 104, 255), Color(8, 131, 149, 255));
                } else {
                    // Inactive Titlebar: Dark Slate Gradient
                    gfx_draw_gradient_v(titlebar_rect.x, titlebar_rect.y, titlebar_rect.width, titlebar_rect.height,
                                        Color(30, 41, 59, 255), Color(51, 65, 85, 255));
                }

                // Window Title (with 1px drop shadow)
                int32_t text_x = b.x + 8;
                int32_t text_y = b.y + (WINDOW_TITLEBAR_HEIGHT - 16) / 2;
                font_draw_string(text_x + 1, text_y + 1, curr->title, Color(5, 25, 35, 255));
                font_draw_string(text_x, text_y, curr->title, COLOR_WHITE);

                // Titlebar Buttons
                if (curr->flags & WF_CLOSABLE) {
                    Rect close_btn = get_close_btn_rect(curr);
                    gfx_fill_rounded_rect(close_btn.x, close_btn.y, close_btn.width, close_btn.height, 2, COLOR_CLOSE_RED);
                    // Draw white 'X'
                    int32_t bx = close_btn.x + 4;
                    int32_t by = close_btn.y + 4;
                    gfx_draw_line(bx, by, bx + 7, by + 7, COLOR_WHITE);
                    gfx_draw_line(bx + 7, by, bx, by + 7, COLOR_WHITE);
                }

                if (curr->flags & WF_MINIMIZABLE) {
                    Rect min_btn = get_min_btn_rect(curr);
                    gfx_fill_rounded_rect(min_btn.x, min_btn.y, min_btn.width, min_btn.height, 2, COLOR_MIN_BLUE);
                    // Draw white '-'
                    int32_t bx = min_btn.x + 3;
                    int32_t by = min_btn.y + min_btn.height / 2;
                    gfx_draw_line(bx, by, bx + 9, by, COLOR_WHITE);
                }
            }

            // Window border inner lines
            gfx_draw_rect(b.x + 1, b.y + 1, b.width - 2, b.height - 2, Color(15, 23, 42, 255));
        }

        // Fill Client Area Background
        gfx_fill_rect(curr->client_bounds.x, curr->client_bounds.y,
                      curr->client_bounds.width, curr->client_bounds.height, COLOR_PANEL_BG);

        // Application Paint Callback with strict clipping
        if (curr->app) {
            gfx_push_clip_rect(curr->client_bounds);
            curr->app->on_paint(curr->client_bounds);
            gfx_pop_clip_rect();
        }

        curr = curr->next;
    }
}
