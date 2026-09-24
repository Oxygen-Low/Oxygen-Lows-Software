#include "gui/window.h"
#include "gui/font.h"
#include "gui/theme.h"
#include "apps/app.h"
#include "mm/heap.h"
#include "drivers/serial.h"
#include "arch/x86_64/pit.h"

static Window* g_wm_head = nullptr; // Bottom window (rendered first)
static Window* g_wm_tail = nullptr; // Top window (rendered last, active focus)
static uint32_t g_next_window_id = 1;

static bool    g_is_dragging = false;
static Window* g_drag_window = nullptr;
static int32_t g_drag_offset_x = 0;
static int32_t g_drag_offset_y = 0;

// 8-Way Window Resizing state
static bool            g_is_resizing = false;
static Window*         g_resize_window = nullptr;
static ResizeDirection g_resize_dir = RESIZE_NONE;
static int32_t         g_resize_start_x = 0;
static int32_t         g_resize_start_y = 0;
static Rect            g_resize_initial_bounds;

// Double click titlebar detection
static Window*         g_last_title_win = nullptr;
static uint64_t        g_last_title_click_ms = 0;

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
        win->bounds.x + win->bounds.width - WINDOW_BORDER_WIDTH - WINDOW_BTN_SIZE - 4,
        win->bounds.y + (WINDOW_TITLEBAR_HEIGHT - WINDOW_BTN_SIZE) / 2,
        WINDOW_BTN_SIZE,
        WINDOW_BTN_SIZE
    );
}

static Rect get_max_btn_rect(const Window* win) {
    int32_t close_left = win->bounds.x + win->bounds.width - WINDOW_BORDER_WIDTH - WINDOW_BTN_SIZE - 4;
    return Rect(
        close_left - WINDOW_BTN_SIZE - 4,
        win->bounds.y + (WINDOW_TITLEBAR_HEIGHT - WINDOW_BTN_SIZE) / 2,
        WINDOW_BTN_SIZE,
        WINDOW_BTN_SIZE
    );
}

static Rect get_min_btn_rect(const Window* win) {
    int32_t close_left = win->bounds.x + win->bounds.width - WINDOW_BORDER_WIDTH - WINDOW_BTN_SIZE - 4;
    int32_t offset = (win->flags & WF_MAXIMIZABLE) ? (2 * (WINDOW_BTN_SIZE + 4)) : (WINDOW_BTN_SIZE + 4);
    return Rect(
        close_left - offset,
        win->bounds.y + (WINDOW_TITLEBAR_HEIGHT - WINDOW_BTN_SIZE) / 2,
        WINDOW_BTN_SIZE,
        WINDOW_BTN_SIZE
    );
}

ResizeDirection wm_get_resize_direction(const Window* win, int32_t x, int32_t y) {
    if (!win || (win->flags & WF_BORDERLESS) || !(win->flags & WF_RESIZABLE) || win->state == WS_MAXIMIZED) {
        return RESIZE_NONE;
    }

    const Rect& b = win->bounds;
    // Check if within outer bounding box including margin
    if (x < b.x - 2 || x > b.x + b.width + 2 || y < b.y - 2 || y > b.y + b.height + 2) {
        return RESIZE_NONE;
    }

    bool on_left   = (x >= b.x - 2 && x <= b.x + WINDOW_RESIZE_BORDER);
    bool on_right  = (x >= b.x + b.width - WINDOW_RESIZE_BORDER && x <= b.x + b.width + 2);
    bool on_top    = (y >= b.y - 2 && y <= b.y + WINDOW_RESIZE_BORDER);
    bool on_bottom = (y >= b.y + b.height - WINDOW_RESIZE_BORDER && y <= b.y + b.height + 2);

    if (on_top && on_left)     return RESIZE_NW;
    if (on_top && on_right)    return RESIZE_NE;
    if (on_bottom && on_left)  return RESIZE_SW;
    if (on_bottom && on_right) return RESIZE_SE;
    if (on_left)               return RESIZE_W;
    if (on_right)              return RESIZE_E;
    if (on_top)                return RESIZE_N;
    if (on_bottom)             return RESIZE_S;

    return RESIZE_NONE;
}

void wm_init(void) {
    g_wm_head = nullptr;
    g_wm_tail = nullptr;
    g_next_window_id = 1;
    g_is_dragging = false;
    g_drag_window = nullptr;
    g_is_resizing = false;
    g_resize_window = nullptr;
    g_resize_dir = RESIZE_NONE;
    g_last_title_win = nullptr;
    g_last_title_click_ms = 0;

    serial_printf("[WM] Window manager initialized with 8-way resize & maximize\n");
}

Window* wm_create_window(const char* title, int32_t x, int32_t y, int32_t w, int32_t h, uint32_t flags, Application* app) {
    auto* win = reinterpret_cast<Window*>(kmalloc(sizeof(Window)));
    if (!win) {
        serial_printf("[WM] Error: Failed to allocate window struct\n");
        return nullptr;
    }

    win->id = g_next_window_id++;
    
    // Copy title with strict termination guarantee (B18)
    size_t i = 0;
    if (title) {
        while (title[i] && i < WINDOW_MAX_TITLE_LEN - 1) {
            win->title[i] = title[i];
            i++;
        }
    }
    win->title[i] = '\0';
    win->title[WINDOW_MAX_TITLE_LEN - 1] = '\0';

    win->bounds = Rect(x, y, w, h);
    win->normal_bounds = win->bounds;
    win->flags = flags | WF_RESIZABLE | WF_MAXIMIZABLE; // Enable resizing and maximizing by default
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
    if (g_resize_window == win) {
        g_is_resizing = false;
        g_resize_window = nullptr;
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
    if (win->state == WS_MAXIMIZED) {
        win->bounds = win->normal_bounds;
        update_client_bounds(win);
        if (win->app) win->app->on_resize(win->client_bounds.width, win->client_bounds.height);
    }
    win->state = WS_NORMAL;
    wm_focus_window(win);
}

void wm_maximize_window(Window* win) {
    if (!win) return;
    if (win->state == WS_MAXIMIZED) {
        wm_restore_window(win);
        return;
    }

    win->normal_bounds = win->bounds;
    int32_t screen_w = static_cast<int32_t>(fb_get_width());
    int32_t screen_h = static_cast<int32_t>(fb_get_height());
    int32_t usable_h = screen_h - 32; // Leave taskbar visible

    win->bounds = Rect(0, 0, screen_w, usable_h);
    win->state = WS_MAXIMIZED;
    update_client_bounds(win);
    wm_focus_window(win);
    if (win->app) {
        win->app->on_resize(win->client_bounds.width, win->client_bounds.height);
    }
}

void wm_toggle_maximize(Window* win) {
    if (!win) return;
    if (win->state == WS_MAXIMIZED) {
        wm_restore_window(win);
    } else {
        wm_maximize_window(win);
    }
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
        if (curr->state != WS_MINIMIZED) {
            // Expand hit bounds slightly for resize borders
            Rect hit_rect = curr->bounds;
            if (curr->flags & WF_RESIZABLE) {
                hit_rect.x -= 2;
                hit_rect.y -= 2;
                hit_rect.width += 4;
                hit_rect.height += 4;
            }
            if (hit_rect.contains(x, y)) {
                return curr;
            }
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

    // 1. Check Resizing on window border
    if ((win->flags & WF_RESIZABLE) && win->state != WS_MAXIMIZED) {
        ResizeDirection dir = wm_get_resize_direction(win, x, y);
        if (dir != RESIZE_NONE) {
            g_is_resizing = true;
            g_resize_window = win;
            g_resize_dir = dir;
            g_resize_start_x = x;
            g_resize_start_y = y;
            g_resize_initial_bounds = win->bounds;
            return true;
        }
    }

    // 2. Titlebar clicks
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

        // Maximize / Restore button check
        if (win->flags & WF_MAXIMIZABLE) {
            Rect max_btn = get_max_btn_rect(win);
            if (max_btn.contains(x, y)) {
                wm_toggle_maximize(win);
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

        // Double click on titlebar to maximize/restore
        if (title_rect.contains(x, y)) {
            uint64_t now_ms = pit_get_uptime_ms();
            if (g_last_title_win == win && (now_ms - g_last_title_click_ms) < 350) {
                wm_toggle_maximize(win);
                g_last_title_win = nullptr;
                g_last_title_click_ms = 0;
                return true;
            }
            g_last_title_win = win;
            g_last_title_click_ms = now_ms;

            // Start drag only if not maximized
            if (win->state != WS_MAXIMIZED) {
                g_is_dragging = true;
                g_drag_window = win;
                g_drag_offset_x = x - win->bounds.x;
                g_drag_offset_y = y - win->bounds.y;
            }
            return true;
        }
    }

    // 3. Client area mouse down
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

    if (g_is_resizing) {
        g_is_resizing = false;
        if (g_resize_window && g_resize_window->app) {
            g_resize_window->app->on_resize(g_resize_window->client_bounds.width,
                                            g_resize_window->client_bounds.height);
        }
        g_resize_window = nullptr;
        g_resize_dir = RESIZE_NONE;
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
    int32_t screen_w = static_cast<int32_t>(fb_get_width());
    int32_t screen_h = static_cast<int32_t>(fb_get_height());

    // 1. Resizing in progress
    if (g_is_resizing && g_resize_window) {
        int32_t dx = x - g_resize_start_x;
        int32_t dy = y - g_resize_start_y;
        Rect new_b = g_resize_initial_bounds;

        // Apply East
        if (g_resize_dir == RESIZE_E || g_resize_dir == RESIZE_NE || g_resize_dir == RESIZE_SE) {
            new_b.width += dx;
            if (new_b.width < WINDOW_MIN_WIDTH) new_b.width = WINDOW_MIN_WIDTH;
        }
        // Apply West
        if (g_resize_dir == RESIZE_W || g_resize_dir == RESIZE_NW || g_resize_dir == RESIZE_SW) {
            int32_t nw = new_b.width - dx;
            if (nw >= WINDOW_MIN_WIDTH) {
                new_b.x += dx;
                new_b.width = nw;
            } else {
                new_b.x += (new_b.width - WINDOW_MIN_WIDTH);
                new_b.width = WINDOW_MIN_WIDTH;
            }
        }
        // Apply South
        if (g_resize_dir == RESIZE_S || g_resize_dir == RESIZE_SW || g_resize_dir == RESIZE_SE) {
            new_b.height += dy;
            if (new_b.height < WINDOW_MIN_HEIGHT) new_b.height = WINDOW_MIN_HEIGHT;
        }
        // Apply North
        if (g_resize_dir == RESIZE_N || g_resize_dir == RESIZE_NW || g_resize_dir == RESIZE_NE) {
            int32_t nh = new_b.height - dy;
            if (nh >= WINDOW_MIN_HEIGHT) {
                new_b.y += dy;
                new_b.height = nh;
            } else {
                new_b.y += (new_b.height - WINDOW_MIN_HEIGHT);
                new_b.height = WINDOW_MIN_HEIGHT;
            }
        }

        // Clamp to screen boundaries
        if (new_b.y < 0) new_b.y = 0;
        if (new_b.y + new_b.height > screen_h - 32) new_b.height = screen_h - 32 - new_b.y;

        g_resize_window->bounds = new_b;
        g_resize_window->normal_bounds = new_b;
        update_client_bounds(g_resize_window);
        g_resize_window->is_dirty = true;

        if (g_resize_window->app) {
            g_resize_window->app->on_resize(g_resize_window->client_bounds.width,
                                            g_resize_window->client_bounds.height);
        }
        return true;
    }

    // 2. Dragging in progress
    if (g_is_dragging && g_drag_window) {
        int32_t new_x = x - g_drag_offset_x;
        int32_t new_y = y - g_drag_offset_y;

        if (new_x < -g_drag_window->bounds.width + 50) new_x = -g_drag_window->bounds.width + 50;
        if (new_x > screen_w - 50) new_x = screen_w - 50;
        if (new_y < 0) new_y = 0;
        if (new_y > screen_h - 32 - WINDOW_TITLEBAR_HEIGHT) new_y = screen_h - 32 - WINDOW_TITLEBAR_HEIGHT;

        g_drag_window->bounds.x = new_x;
        g_drag_window->bounds.y = new_y;
        g_drag_window->normal_bounds = g_drag_window->bounds;
        update_client_bounds(g_drag_window);
        g_drag_window->is_dirty = true;
        return true;
    }

    // 3. Normal client move
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
    if (g_wm_tail && g_wm_tail->state != WS_MINIMIZED && g_wm_tail->app) {
        g_wm_tail->app->on_key_down(scancode, ascii);
        return true;
    }
    return false;
}

static bool is_rect_occluded_by(const Rect& r, const Window* above) {
    if (!above || above->state == WS_MINIMIZED) return false;
    // An opaque window completely covers rectangle r if r is completely inside above->bounds
    return (r.x >= above->bounds.x &&
            r.y >= above->bounds.y &&
            (r.x + r.width) <= (above->bounds.x + above->bounds.width) &&
            (r.y + r.height) <= (above->bounds.y + above->bounds.height));
}

void wm_render(void) {
    const Theme* theme = theme_get_current();

    // Render windows from bottom (head) to top (tail)
    Window* curr = g_wm_head;
    while (curr) {
        if (curr->state == WS_MINIMIZED) {
            curr = curr->next;
            continue;
        }

        // P07: Check if curr window is fully occluded by any window above it in Z-order
        bool full_window_occluded = false;
        bool client_occluded = false;
        for (Window* above = curr->next; above; above = above->next) {
            if (is_rect_occluded_by(curr->bounds, above)) {
                full_window_occluded = true;
                break;
            }
            if (!client_occluded && is_rect_occluded_by(curr->client_bounds, above)) {
                client_occluded = true;
            }
        }

        if (full_window_occluded) {
            // Entire window is covered by an opaque window above; skip all rendering
            curr = curr->next;
            continue;
        }

        const Rect& b = curr->bounds;
        
        if (!(curr->flags & WF_BORDERLESS)) {
            // Drop shadow (only for normal window state)
            if (curr->state != WS_MAXIMIZED) {
                gfx_fill_rect(b.x + 4, b.y + 4, b.width, b.height, theme->shadow_color);
            }

            // Outer frame border
            Color border_outer = curr->is_focused ? theme->window_border_active : theme->window_border_inactive;
            gfx_draw_rect(b.x, b.y, b.width, b.height, border_outer);

            // Titlebar
            if (curr->flags & WF_TITLEBAR) {
                Rect titlebar_rect(b.x + 1, b.y + 1, b.width - 2, WINDOW_TITLEBAR_HEIGHT - 1);
                
                if (curr->is_focused) {
                    gfx_draw_gradient_v(titlebar_rect.x, titlebar_rect.y, titlebar_rect.width, titlebar_rect.height,
                                        theme->titlebar_active_top, theme->titlebar_active_bottom);
                } else {
                    gfx_draw_gradient_v(titlebar_rect.x, titlebar_rect.y, titlebar_rect.width, titlebar_rect.height,
                                        theme->titlebar_inactive_top, theme->titlebar_inactive_bottom);
                }

                // Window Title (with 1px subtle drop shadow)
                int32_t text_x = b.x + 8;
                int32_t text_y = b.y + (WINDOW_TITLEBAR_HEIGHT - 16) / 2;
                font_draw_string(text_x + 1, text_y + 1, curr->title, Color(5, 10, 20, 200));
                font_draw_string(text_x, text_y, curr->title,
                                 curr->is_focused ? theme->titlebar_text_active : theme->titlebar_text_inactive);

                // Titlebar Buttons: Close, Maximize/Restore, Minimize
                if (curr->flags & WF_CLOSABLE) {
                    Rect close_btn = get_close_btn_rect(curr);
                    gfx_fill_rounded_rect(close_btn.x, close_btn.y, close_btn.width, close_btn.height, 2, theme->close_btn);
                    // Draw 'X'
                    int32_t bx = close_btn.x + 4;
                    int32_t by = close_btn.y + 4;
                    gfx_draw_line(bx, by, bx + 7, by + 7, COLOR_WHITE);
                    gfx_draw_line(bx + 7, by, bx, by + 7, COLOR_WHITE);
                }

                if (curr->flags & WF_MAXIMIZABLE) {
                    Rect max_btn = get_max_btn_rect(curr);
                    gfx_fill_rounded_rect(max_btn.x, max_btn.y, max_btn.width, max_btn.height, 2, theme->max_btn);
                    // Draw square outline or restore icon
                    if (curr->state == WS_MAXIMIZED) {
                        // Two overlapping small squares for restore
                        gfx_draw_rect(max_btn.x + 3, max_btn.y + 3, 7, 7, COLOR_WHITE);
                        gfx_draw_rect(max_btn.x + 6, max_btn.y + 6, 7, 7, COLOR_WHITE);
                    } else {
                        // Single square for maximize
                        gfx_draw_rect(max_btn.x + 4, max_btn.y + 4, 8, 8, COLOR_WHITE);
                        gfx_draw_line(max_btn.x + 4, max_btn.y + 5, max_btn.x + 11, max_btn.y + 5, COLOR_WHITE);
                    }
                }

                if (curr->flags & WF_MINIMIZABLE) {
                    Rect min_btn = get_min_btn_rect(curr);
                    gfx_fill_rounded_rect(min_btn.x, min_btn.y, min_btn.width, min_btn.height, 2, theme->min_btn);
                    // Draw '-'
                    int32_t bx = min_btn.x + 3;
                    int32_t by = min_btn.y + min_btn.height / 2;
                    gfx_draw_line(bx, by, bx + 9, by, COLOR_WHITE);
                }
            }

            // Window border inner lines
            gfx_draw_rect(b.x + 1, b.y + 1, b.width - 2, b.height - 2, theme->window_border_inner);
        }

        // Fill Client Area Background and paint application (if not occluded)
        if (!client_occluded) {
            gfx_fill_rect(curr->client_bounds.x, curr->client_bounds.y,
                          curr->client_bounds.width, curr->client_bounds.height, theme->panel_bg);

            // Application Paint Callback with strict clipping
            if (curr->app) {
                gfx_push_clip_rect(curr->client_bounds);
                curr->app->on_paint(curr->client_bounds);
                gfx_pop_clip_rect();
            }
        }

        curr = curr->next;
    }
}
