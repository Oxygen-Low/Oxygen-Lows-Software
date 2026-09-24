#ifndef OXYGEN_GUI_FILE_DIALOG_H
#define OXYGEN_GUI_FILE_DIALOG_H

#include "types.h"
#include "gui/graphics.h"
#include "fs/vfs.h"

enum FileDialogMode : uint8_t {
    FILE_DIALOG_OPEN,
    FILE_DIALOG_SAVE
};

#define FILE_DIALOG_MAX_ENTRIES 32
#define FILE_DIALOG_PATH_MAX    192

struct FileDialog {
    FileDialogMode mode;
    bool           visible;
    bool           is_done;
    bool           is_cancelled;
    
    char           current_path[FILE_DIALOG_PATH_MAX];
    char           selected_file[VFS_MAX_NAME_LEN];
    char           result_path[FILE_DIALOG_PATH_MAX];

    VFSDirectoryEntry entries[FILE_DIALOG_MAX_ENTRIES];
    size_t         entry_count;
    int32_t        selected_index;

    // Double click detection
    int32_t        last_clicked_index;
    uint64_t       last_click_ms;
};

#ifdef __cplusplus
extern "C" {
#endif

void file_dialog_open(FileDialog* dlg, FileDialogMode mode, const char* initial_dir = "/docs");
void file_dialog_refresh(FileDialog* dlg);
void file_dialog_render(const FileDialog* dlg, const Rect& bounds);
bool file_dialog_handle_mouse(FileDialog* dlg, int32_t local_x, int32_t local_y, uint8_t buttons, const Rect& bounds);
bool file_dialog_handle_key(FileDialog* dlg, uint8_t scancode, char ascii);
void file_dialog_close(FileDialog* dlg);

#ifdef __cplusplus
}
#endif

#endif // OXYGEN_GUI_FILE_DIALOG_H
