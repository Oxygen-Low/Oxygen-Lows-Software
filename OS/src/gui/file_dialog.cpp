#include "gui/file_dialog.h"
#include "gui/font.h"
#include "gui/theme.h"
#include "arch/x86_64/pit.h"

namespace {

void str_copy_buf(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (src[i] && i < max_len - 1) {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

void build_full_path(char* out_path, const char* dir, const char* file, size_t max_len) {
    size_t idx = 0;
    while (dir[idx] && idx < max_len - 1) {
        out_path[idx] = dir[idx];
        idx++;
    }
    if (idx > 1 && out_path[idx - 1] != '/' && idx < max_len - 1) {
        out_path[idx++] = '/';
    } else if (idx == 0) {
        out_path[idx++] = '/';
    }

    size_t f_idx = 0;
    while (file[f_idx] && idx < max_len - 1) {
        out_path[idx++] = file[f_idx++];
    }
    out_path[idx] = '\0';
}

} // anonymous namespace

extern "C" {

void file_dialog_open(FileDialog* dlg, FileDialogMode mode, const char* initial_dir) {
    if (!dlg) return;
    dlg->mode = mode;
    dlg->visible = true;
    dlg->is_done = false;
    dlg->is_cancelled = false;
    dlg->selected_index = -1;
    dlg->last_clicked_index = -1;
    dlg->last_click_ms = 0;
    dlg->selected_file[0] = '\0';
    dlg->result_path[0] = '\0';

    str_copy_buf(dlg->current_path, initial_dir ? initial_dir : "/", sizeof(dlg->current_path));
    file_dialog_refresh(dlg);
}

void file_dialog_refresh(FileDialog* dlg) {
    if (!dlg) return;
    dlg->entry_count = 0;
    dlg->selected_index = -1;

    VFSNode* dir = vfs_resolve_path(dlg->current_path);
    if (!dir || dir->type != VFS_TYPE_DIRECTORY) return;

    for (size_t i = 0; i < dir->child_count && dlg->entry_count < FILE_DIALOG_MAX_ENTRIES; ++i) {
        VFSDirectoryEntry entry;
        if (vfs_readdir(dir, i, &entry)) {
            dlg->entries[dlg->entry_count++] = entry;
        }
    }
}

void file_dialog_close(FileDialog* dlg) {
    if (!dlg) return;
    dlg->visible = false;
}

void file_dialog_render(const FileDialog* dlg, const Rect& bounds) {
    if (!dlg || !dlg->visible) return;

    const Theme* theme = theme_get_current();

    // Semi-transparent backdrop shadow
    gfx_fill_rect(bounds.x + 6, bounds.y + 6, bounds.width, bounds.height, Color(0, 0, 0, 140));

    // Dialog Window Frame
    gfx_fill_rounded_rect(bounds.x, bounds.y, bounds.width, bounds.height, 4, Color(15, 23, 42, 250));
    gfx_draw_rounded_rect(bounds.x, bounds.y, bounds.width, bounds.height, 4, theme->accent);

    // Titlebar
    int32_t tb_h = 24;
    gfx_draw_gradient_v(bounds.x + 1, bounds.y + 1, bounds.width - 2, tb_h,
                        theme->titlebar_active_top, theme->titlebar_active_bottom);

    const char* title_text = (dlg->mode == FILE_DIALOG_OPEN) ? "Open File" : "Save File As...";
    font_draw_string(bounds.x + 8, bounds.y + 4, title_text, COLOR_WHITE);

    // Close button (X)
    int32_t close_x = bounds.x + bounds.width - 20;
    int32_t close_y = bounds.y + 4;
    gfx_fill_rounded_rect(close_x, close_y, 16, 16, 2, theme->close_btn);
    gfx_draw_line(close_x + 4, close_y + 4, close_x + 11, close_y + 11, COLOR_WHITE);
    gfx_draw_line(close_x + 11, close_y + 4, close_x + 4, close_y + 11, COLOR_WHITE);

    // Current Path Bar & [.. Up] button
    int32_t path_y = bounds.y + tb_h + 6;
    font_draw_string(bounds.x + 10, path_y + 4, "Folder:", Color(148, 163, 184, 255));

    int32_t path_box_x = bounds.x + 65;
    int32_t path_box_w = bounds.width - 135;
    gfx_fill_rect(path_box_x, path_y, path_box_w, 20, Color(30, 41, 59, 255));
    gfx_draw_rect(path_box_x, path_y, path_box_w, 20, Color(51, 65, 85, 255));
    font_draw_string(path_box_x + 6, path_y + 2, dlg->current_path, COLOR_WHITE);

    // [Up ..] Button
    int32_t up_btn_x = bounds.x + bounds.width - 62;
    gfx_fill_rounded_rect(up_btn_x, path_y, 52, 20, 3, Color(10, 77, 104, 255));
    gfx_draw_rounded_rect(up_btn_x, path_y, 52, 20, 3, theme->accent);
    font_draw_string(up_btn_x + 6, path_y + 2, "[^ Up]", COLOR_WHITE);

    // File List Box
    int32_t list_y = path_y + 26;
    int32_t list_h = bounds.height - 110;
    int32_t list_w = bounds.width - 20;
    gfx_fill_rect(bounds.x + 10, list_y, list_w, list_h, Color(11, 19, 43, 255));
    gfx_draw_rect(bounds.x + 10, list_y, list_w, list_h, Color(51, 65, 85, 255));

    int32_t item_y = list_y + 4;
    for (size_t i = 0; i < dlg->entry_count; ++i) {
        if (item_y + 18 > list_y + list_h) break;

        bool is_sel = (static_cast<int32_t>(i) == dlg->selected_index);
        Color row_bg = is_sel ? Color(8, 131, 149, 180) : Color(0, 0, 0, 0);

        if (is_sel) {
            gfx_fill_rect(bounds.x + 12, item_y - 1, list_w - 4, 18, row_bg);
        }

        bool is_dir = (dlg->entries[i].type == VFS_TYPE_DIRECTORY);
        const char* prefix = is_dir ? "[DIR]" : "[TXT]";
        Color prefix_col = is_dir ? Color(234, 179, 8, 255) : theme->accent;

        font_draw_string(bounds.x + 16, item_y, prefix, prefix_col);
        font_draw_string(bounds.x + 60, item_y, dlg->entries[i].name, COLOR_WHITE);

        if (!is_dir) {
            font_printf(bounds.x + list_w - 70, item_y, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                        "%u B", static_cast<unsigned int>(dlg->entries[i].size));
        }

        item_y += 18;
    }

    // Filename Input Box & Action Buttons at Bottom
    int32_t bot_y = bounds.y + bounds.height - 38;
    font_draw_string(bounds.x + 10, bot_y + 4, "File:", Color(148, 163, 184, 255));

    int32_t input_x = bounds.x + 50;
    int32_t input_w = bounds.width - 210;
    gfx_fill_rect(input_x, bot_y, input_w, 22, Color(255, 255, 255, 255));
    gfx_draw_rect(input_x, bot_y, input_w, 22, Color(51, 65, 85, 255));
    font_draw_string(input_x + 6, bot_y + 3, dlg->selected_file, Color(15, 23, 42, 255));

    // [Action] Button (Open or Save)
    int32_t act_btn_x = bounds.x + bounds.width - 150;
    const char* act_text = (dlg->mode == FILE_DIALOG_OPEN) ? " Open " : " Save ";
    gfx_fill_rounded_rect(act_btn_x, bot_y, 65, 22, 3, theme->accent);
    font_draw_string(act_btn_x + 8, bot_y + 3, act_text, COLOR_BLACK);

    // [Cancel] Button
    int32_t cancel_btn_x = bounds.x + bounds.width - 75;
    gfx_fill_rounded_rect(cancel_btn_x, bot_y, 65, 22, 3, Color(71, 85, 105, 255));
    font_draw_string(cancel_btn_x + 8, bot_y + 3, "Cancel", COLOR_WHITE);
}

bool file_dialog_handle_mouse(FileDialog* dlg, int32_t local_x, int32_t local_y, uint8_t buttons, const Rect& bounds) {
    if (!dlg || !dlg->visible || !(buttons & 1)) return false;

    // Check Close button (X)
    int32_t close_x = bounds.x + bounds.width - 20;
    int32_t close_y = bounds.y + 4;
    if (local_x >= close_x && local_x <= close_x + 16 && local_y >= close_y && local_y <= close_y + 16) {
        dlg->is_cancelled = true;
        dlg->visible = false;
        return true;
    }

    // Check [Up ..] Button
    int32_t tb_h = 24;
    int32_t path_y = bounds.y + tb_h + 6;
    int32_t up_btn_x = bounds.x + bounds.width - 62;
    if (local_x >= up_btn_x && local_x <= up_btn_x + 52 && local_y >= path_y && local_y <= path_y + 20) {
        // Go up one level
        int len = 0;
        while (dlg->current_path[len]) len++;
        if (len > 1) {
            int last_slash = 0;
            for (int i = 0; i < len; ++i) {
                if (dlg->current_path[i] == '/') last_slash = i;
            }
            if (last_slash == 0) {
                dlg->current_path[1] = '\0';
            } else {
                dlg->current_path[last_slash] = '\0';
            }
            file_dialog_refresh(dlg);
        }
        return true;
    }

    // Check List Item Clicks
    int32_t list_y = path_y + 26;
    int32_t list_h = bounds.height - 110;
    int32_t list_w = bounds.width - 20;
    if (local_x >= bounds.x + 10 && local_x <= bounds.x + 10 + list_w &&
        local_y >= list_y && local_y <= list_y + list_h) {
        int32_t clicked_idx = (local_y - (list_y + 4)) / 18;
        if (clicked_idx >= 0 && clicked_idx < static_cast<int32_t>(dlg->entry_count)) {
            uint64_t now = pit_get_uptime_ms();
            bool is_double_click = (dlg->last_clicked_index == clicked_idx && (now - dlg->last_click_ms) < 400);
            dlg->last_clicked_index = clicked_idx;
            dlg->last_click_ms = now;

            dlg->selected_index = clicked_idx;
            str_copy_buf(dlg->selected_file, dlg->entries[clicked_idx].name, sizeof(dlg->selected_file));

            if (is_double_click && dlg->entries[clicked_idx].type == VFS_TYPE_DIRECTORY) {
                // Navigate into directory
                char new_path[FILE_DIALOG_PATH_MAX];
                build_full_path(new_path, dlg->current_path, dlg->entries[clicked_idx].name, sizeof(new_path));
                str_copy_buf(dlg->current_path, new_path, sizeof(dlg->current_path));
                dlg->selected_file[0] = '\0';
                dlg->selected_index = -1;
                file_dialog_refresh(dlg);
                return true;
            } else if (is_double_click && dlg->entries[clicked_idx].type == VFS_TYPE_FILE) {
                // Confirm selection immediately
                build_full_path(dlg->result_path, dlg->current_path, dlg->selected_file, sizeof(dlg->result_path));
                dlg->is_done = true;
                dlg->visible = false;
                return true;
            }
            return true;
        }
    }

    // Check Bottom Action Buttons
    int32_t bot_y = bounds.y + bounds.height - 38;
    int32_t act_btn_x = bounds.x + bounds.width - 150;
    if (local_x >= act_btn_x && local_x <= act_btn_x + 65 && local_y >= bot_y && local_y <= bot_y + 22) {
        if (dlg->selected_file[0] != '\0') {
            build_full_path(dlg->result_path, dlg->current_path, dlg->selected_file, sizeof(dlg->result_path));
            dlg->is_done = true;
            dlg->visible = false;
        }
        return true;
    }

    int32_t cancel_btn_x = bounds.x + bounds.width - 75;
    if (local_x >= cancel_btn_x && local_x <= cancel_btn_x + 65 && local_y >= bot_y && local_y <= bot_y + 22) {
        dlg->is_cancelled = true;
        dlg->visible = false;
        return true;
    }

    return true;
}

bool file_dialog_handle_key(FileDialog* dlg, uint8_t scancode, char ascii) {
    if (!dlg || !dlg->visible) return false;

    if (ascii == '\n' || ascii == '\r') {
        if (dlg->selected_file[0] != '\0') {
            build_full_path(dlg->result_path, dlg->current_path, dlg->selected_file, sizeof(dlg->result_path));
            dlg->is_done = true;
            dlg->visible = false;
            return true;
        }
    } else if (ascii == 27) { // Escape
        dlg->is_cancelled = true;
        dlg->visible = false;
        return true;
    } else if (ascii == '\b') {
        size_t len = 0;
        while (dlg->selected_file[len]) len++;
        if (len > 0) {
            dlg->selected_file[len - 1] = '\0';
            return true;
        }
    } else if (ascii >= 32 && ascii <= 126) {
        size_t len = 0;
        while (dlg->selected_file[len]) len++;
        if (len < VFS_MAX_NAME_LEN - 1) {
            dlg->selected_file[len++] = ascii;
            dlg->selected_file[len] = '\0';
            return true;
        }
    }
    UNUSED(scancode);
    return false;
}

} // extern "C"
